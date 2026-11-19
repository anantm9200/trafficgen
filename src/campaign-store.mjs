import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {validateCampaignDraft,nextCampaignTick} from './campaign-definition.mjs';

const ISO=ms=>new Date(ms).toISOString();
const statuses=new Set(['draft','active','paused','archived']);
const runStatuses=new Set(['queued','running','completed','failed','cancelled']);
const parse=row=>row?{id:row.id,draft:JSON.parse(row.draft),status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,lastDispatchedAt:row.last_dispatched_at}:null;
const cleanRun=row=>row?({id:row.id,campaignId:row.campaign_id,status:row.status,sessionBudget:row.session_budget,
 createdAt:row.created_at,startedAt:row.started_at,finishedAt:row.finished_at,workerJobId:row.worker_job_id,
 error:row.error,report:row.report?JSON.parse(row.report):null}):null;
const minDay=ms=>ISO(ms).slice(0,10)+'T00:00:00.000Z';
const maxDay=ms=>ISO(ms).slice(0,10)+'T23:59:59.999Z';
const fail=(reason,status=400)=>Object.assign(new Error(reason),{status});

/** Durable, local-only campaign metadata. Verification tokens are NEVER stored. */
export class CampaignStore{
 constructor({path=':memory:'}={}){
  if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(path);
  if(path!==':memory:')chmodSync(resolve(path),0o600);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, draft TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_dispatched_at TEXT);
   CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    status TEXT NOT NULL,session_budget INTEGER NOT NULL,idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,worker_job_id TEXT,error TEXT,report TEXT,
    UNIQUE(campaign_id,idempotency_key));
   CREATE INDEX IF NOT EXISTS runs_recent ON runs(campaign_id,created_at DESC);
   CREATE INDEX IF NOT EXISTS runs_status ON runs(status);`);
 }
 close(){this.db.close()}
 create(raw,{now=Date.now()}={}){
  let draft;try{draft=validateCampaignDraft(raw)}catch(e){throw fail(String(e.message).slice(0,160),400)}
  const id=randomUUID(),created=ISO(now);
  this.db.prepare('INSERT INTO campaigns(id,draft,status,created_at,updated_at) VALUES(?,?,?,?,?)')
   .run(id,JSON.stringify(draft),'draft',created,created);
  return this.get(id);
 }
 get(id){return parse(this.db.prepare('SELECT * FROM campaigns WHERE id=?').get(id))}
 list({limit=100}={}){return this.db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT ?').all(Math.min(Math.max(limit,1),100)).map(parse)}
 status(id,status,{now=Date.now()}={}){
  if(!statuses.has(status))throw fail('Invalid campaign status');
  const old=this.get(id);if(!old)throw fail('Campaign not found',404);
  if(old.status==='archived')throw fail('Archived campaign cannot be restarted',409);
  this.db.prepare('UPDATE campaigns SET status=?,updated_at=? WHERE id=?').run(status,ISO(now),id);
  return this.get(id);
 }
 runs(campaignId,{limit=50}={}){
  return this.db.prepare('SELECT * FROM runs WHERE campaign_id=? ORDER BY created_at DESC LIMIT ?').all(campaignId,Math.min(Math.max(limit,1),100)).map(cleanRun);
 }
 allRuns({limit=100}={}){return this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(Math.min(Math.max(limit,1),100)).map(cleanRun)}
 getRun(id){return cleanRun(this.db.prepare('SELECT * FROM runs WHERE id=?').get(id))}
 /** Atomic reservation, including queued/running sessions, to prevent overspending daily budgets. */
 reserveRun(campaignId,{idempotencyKey,now=Date.now(),scheduled=false}={}){
  if(typeof idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey))throw fail('Valid idempotency key required');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const campaign=this.get(campaignId);if(!campaign)throw fail('Campaign not found',404);
   const previous=this.db.prepare('SELECT * FROM runs WHERE campaign_id=? AND idempotency_key=?').get(campaignId,idempotencyKey);
   if(previous){this.db.exec('COMMIT');return {run:cleanRun(previous),replayed:true}}
   if(campaign.status!=='active')throw fail('Activate the campaign before dispatch',409);
   const {draft}=campaign;
   if(scheduled&&draft.schedule.type!=='recurring')throw fail('Manual campaign cannot run on a schedule',409);
   const dailyUsed=this.db.prepare("SELECT COALESCE(SUM(session_budget),0) AS used FROM runs WHERE campaign_id=? AND created_at>=? AND created_at<=? AND status!='cancelled'")
    .get(campaignId,minDay(now),maxDay(now)).used;
   const dailyBudget=draft.schedule.type==='recurring'?draft.schedule.dailyBudget:25;
   if(dailyUsed+draft.sessions>dailyBudget)throw fail('Daily campaign budget exhausted',429);
   if(scheduled){
    const tick=nextCampaignTick(draft,{now,lastRunAt:campaign.lastDispatchedAt,completedSessionsToday:dailyUsed});
    if(!tick.due)throw fail('Scheduled campaign not due: '+tick.reason,409);
   }
   const pending=this.db.prepare("SELECT COUNT(*) AS n FROM runs WHERE status IN ('queued','running')").get().n;
   if(pending>=10)throw fail('Global queue capacity reached',429);
   const id=randomUUID(),created=ISO(now);
   this.db.prepare('INSERT INTO runs(id,campaign_id,status,session_budget,idempotency_key,created_at) VALUES(?,?,?,?,?,?)')
    .run(id,campaignId,'queued',draft.sessions,idempotencyKey,created);
   this.db.prepare('UPDATE campaigns SET last_dispatched_at=?,updated_at=? WHERE id=?').run(created,created,campaignId);
   this.db.exec('COMMIT');
   return {run:this.getRun(id),replayed:false};
  }catch(e){this.db.exec('ROLLBACK');throw e}
 }
 updateRun(id,status,{workerJobId=null,error=null,report=null,now=Date.now()}={}){
  if(!runStatuses.has(status))throw fail('Invalid run status');
  const current=this.getRun(id);if(!current)throw fail('Run not found',404);
  if(['completed','failed','cancelled'].includes(current.status)&&current.status!==status)throw fail('Terminal run cannot change state',409);
  if(status==='completed'&&!report)throw fail('Completed runs must have a worker report');
  const started=status==='running'?current.startedAt??ISO(now):current.startedAt;
  const finished=['completed','failed','cancelled'].includes(status)?current.finishedAt??ISO(now):current.finishedAt;
  const jsonReport=report?JSON.stringify(report):null;
  if(jsonReport&&Buffer.byteLength(jsonReport)>2*1024*1024)throw fail('Report too large',413);
  this.db.prepare('UPDATE runs SET status=?,started_at=?,finished_at=?,worker_job_id=COALESCE(?,worker_job_id),error=?,report=COALESCE(?,report) WHERE id=?')
   .run(status,started,finished,workerJobId,error?String(error).slice(0,200):null,jsonReport,id);
  return this.getRun(id);
 }
}
