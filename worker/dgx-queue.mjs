import http from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {normalizeForDgx} from '../src/dispatch-bridge.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
import {publicPlan} from '../src/plan.mjs';
import {queueMetrics} from '../src/worker-metrics.mjs';
import {sameRunIdentity} from '../src/run-identity.mjs';
import {jobTimeoutMs,superviseChild} from '../src/job-supervisor.mjs';
import {loadValidatedJobReport} from '../src/job-report-validation.mjs';
import {relayCampaignToLoopback} from '../src/campaign-loopback.mjs';

const port=Number(process.env.TG_WORKER_PORT||18743);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid worker port');
const dbPath=resolve(process.env.TG_QUEUE_DB||'./.data/trafficgen.sqlite');
mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
const db=new DatabaseSync(dbPath);
chmodSync(dbPath,0o600);
db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,status TEXT NOT NULL,plan TEXT NOT NULL,
  report TEXT,error TEXT,created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT);
 CREATE INDEX IF NOT EXISTS jobs_recent ON jobs(created_at DESC)`);
// Migration is compatible with existing queue database.
if(!db.prepare('PRAGMA table_info(jobs)').all().some(c=>c.name==='run_id'))db.exec('ALTER TABLE jobs ADD COLUMN run_id TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS jobs_run_id ON jobs(run_id)');
db.prepare("UPDATE jobs SET status='failed',error='Worker restarted during execution',finished_at=? WHERE status='running'").run(new Date().toISOString());
const started=Date.now();let active=null,runningPump=null,shuttingDown=false;
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
const authorized=req=>{
 const key=process.env.TG_DGX_JOB_TOKEN||'',h=req.headers.authorization||'',provided=h.startsWith('Bearer ')?h.slice(7):'';
 const a=Buffer.from(key),b=Buffer.from(provided);
 return a.length>=32&&a.length===b.length&&timingSafeEqual(a,b);
};
const publicJob=(row,details=false)=>row&&({id:row.id,status:row.status,createdAt:row.created_at,startedAt:row.started_at,
 finishedAt:row.finished_at,error:row.error,reportAvailable:Boolean(row.report),
 ...(details?{report:row.report?JSON.parse(row.report):null}:{})});
function schedule(){
 if(shuttingDown||runningPump)return;
 runningPump=Promise.resolve().then(pump).catch(e=>console.error('DGX queue pump:',e.message)).finally(()=>{
  runningPump=null;
  if(!shuttingDown&&db.prepare("SELECT id FROM jobs WHERE status='queued' LIMIT 1").get())schedule();
 });
}
async function pump(){
 if(active||shuttingDown)return;
 const row=db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1").get();
 if(!row)return;
 const now=new Date().toISOString();
 const changed=db.prepare("UPDATE jobs SET status='running',started_at=? WHERE id=? AND status='queued'").run(now,row.id);
 if(changed.changes!==1)return;
 let plan;
 try{plan=JSON.parse(row.plan)}catch{
  db.prepare("UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=?").run('Invalid stored run plan',new Date().toISOString(),row.id);
  return;
 }
 // Each browser subprocess owns a fresh process group. Cancelling the job kills
 // that group, including Chromium children, instead of orphaning browser processes.
 const child=spawn(process.execPath,['worker/run.mjs','--env-plan'],{cwd:resolve('.'),
  detached:process.platform!=='win32',
  env:{...process.env,PLAN_B64:Buffer.from(JSON.stringify(plan)).toString('base64url')},stdio:['ignore','pipe','pipe']});
 const controller=superviseChild(child,{timeoutMs:jobTimeoutMs(plan),processGroup:process.platform!=='win32'});
 active={id:row.id,child,controller};
 let errors='';
 child.stdout.on('data',()=>{});
 child.stderr.on('data',c=>{errors=(errors+c.toString()).slice(-4000)});
 const outcome=await controller.done;
 active=null;
 const current=db.prepare('SELECT status FROM jobs WHERE id=?').get(row.id);
 if(current?.status==='cancelled')return;
 let report=null;
 if(!outcome.stopReason&&outcome.exitCode===0){
  report=await loadValidatedJobReport('reports',{runId:plan.runId,startedAt:now});
 }
 const status=!outcome.stopReason&&outcome.exitCode===0&&report?'completed':'failed';
 const failure=outcome.stopReason==='timeout'?'Browser job exceeded its bounded execution time':
  outcome.stopReason==='shutdown'?'Worker shutdown interrupted the browser job':
  outcome.error||errors||'Worker exited without a valid report';
 db.prepare('UPDATE jobs SET status=?,report=?,error=?,finished_at=? WHERE id=?').run(status,report?JSON.stringify(report):null,
  status==='failed'?String(failure).slice(0,500):null,new Date().toISOString(),row.id);
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'trafficgen-dgx-worker',mode:'job-queue',
   uptimeSeconds:Math.floor((Date.now()-started)/1000),activeJob:active?.id||null,
   metrics:queueMetrics(db.prepare('SELECT status,created_at,started_at,finished_at FROM jobs ORDER BY created_at DESC LIMIT 100').all())});
  if(!authorized(req))return send(res,401,{ok:false,error:'Unauthorized'});
  // Only the authenticated worker gateway may reach the separate, durable Campaign API.
  // Both the external route and the loopback route are strictly allowlisted.
  if(url.pathname.startsWith('/campaign-api/')){
   const route=url.pathname.slice('/campaign-api/'.length);
   if(url.search)return send(res,400,{ok:false,error:'Query parameters are not supported'});
   let size=0,parts=[];
   if(['POST','PATCH'].includes(req.method))for await(const chunk of req){
    size+=chunk.length;
    if(size>16384)return send(res,413,{ok:false,error:'Campaign request too large'});
    parts.push(chunk);
   }
   const response=await relayCampaignToLoopback(route,{method:req.method,
    body:parts.length?Buffer.concat(parts).toString('utf8'):undefined,
    port:Number(process.env.TG_CAMPAIGN_PORT||18745)});
   res.writeHead(response.status,{'content-type':response.contentType,'cache-control':'no-store','x-content-type-options':'nosniff'});
   return res.end(response.body);
  }
  if(req.method==='GET'&&url.pathname==='/jobs')return send(res,200,{ok:true,jobs:db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 30').all().map(publicJob)});
  const match=url.pathname.match(/^\/jobs\/([a-f0-9-]{36})(\/cancel)?$/);
  if(req.method==='GET'&&match&&!match[2]){
   const row=db.prepare('SELECT * FROM jobs WHERE id=?').get(match[1]);
   return row?send(res,200,{ok:true,job:publicJob(row,true)}):send(res,404,{ok:false,error:'Job not found'});
  }
  if(req.method==='POST'&&match&&match[2]){
   const row=db.prepare('SELECT status FROM jobs WHERE id=?').get(match[1]);
   if(!row)return send(res,404,{ok:false,error:'Job not found'});
   if(['queued','running'].includes(row.status)){
    db.prepare("UPDATE jobs SET status='cancelled',finished_at=? WHERE id=?").run(new Date().toISOString(),match[1]);
    if(active?.id===match[1])active.controller.stop('cancelled')
   }
   return send(res,200,{ok:true,job:publicJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(match[1]))});
  }
  if(req.method==='POST'&&url.pathname==='/jobs'){
   let size=0,parts=[];
   for await(const chunk of req){size+=chunk.length;if(size>16000)return send(res,413,{ok:false,error:'Plan too large'});parts.push(chunk)}
   let plan;try{plan=normalizeForDgx(JSON.parse(Buffer.concat(parts).toString('utf8')))}catch(e){return send(res,400,{ok:false,error:String(e.message).slice(0,160)})}
   // Never trust upstream ownership status; recheck against the verified DNS proof.
   await verifyOwnership(plan.targetUrl,plan.verificationToken,{method:plan.verificationMethod});
   const existing=db.prepare('SELECT * FROM jobs WHERE run_id=?').get(plan.runId);
   if(existing){
    if(!sameRunIdentity(JSON.parse(existing.plan),plan))return send(res,409,{ok:false,error:'runId is already associated with a different journey'});
    return send(res,200,{ok:true,job:publicJob(existing),replayed:true});
   }
   const pending=db.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('queued','running')").get().n;
   if(pending>=10)return send(res,429,{ok:false,error:'Queue capacity reached'});
   const id=randomUUID();
   db.prepare('INSERT INTO jobs(id,run_id,status,plan,created_at) VALUES(?,?,?,?,?)').run(id,plan.runId,'queued',JSON.stringify(plan),new Date().toISOString());
   schedule();return send(res,202,{ok:true,job:{id,status:'queued',plan:publicPlan(plan)}});
  }
  return send(res,404,{ok:false,error:'Not found'});
 }catch(e){const status=Number.isInteger(e?.status)&&e.status>=400&&e.status<=499?e.status:500;
  console.error('DGX worker:',e?.message);return send(res,status,{ok:false,error:status===500?'Worker request failed':String(e.message).slice(0,160)});
 }
});
server.listen(port,'127.0.0.1',()=>{console.log('TrafficGen DGX queue on loopback:'+port);schedule()});
async function shutdown(){
 if(shuttingDown)return;
 shuttingDown=true;
 server.close();
 active?.controller.stop('shutdown');
 // Wait for the pump's database update before closing SQLite.
 try{if(runningPump)await runningPump}finally{db.close()}
}
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{
 shutdown().then(()=>process.exit(0)).catch(e=>{console.error('Shutdown failure:',e.message);process.exit(1)});
});
