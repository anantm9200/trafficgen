import {reconcileQAObservations} from './qa-analytics.mjs';

const error=(s,status=400)=>Object.assign(new Error(s),{status});
const ISO=()=>new Date().toISOString();
const parse=row=>row?{runId:row.run_id,status:row.status,expectedCount:row.expected_count,
 acceptedTransportCount:row.accepted_count,observedCount:row.observed_count,
 startedAt:row.started_at,finishedAt:row.finished_at,verifiedAt:row.verified_at,
 reconciliation:row.reconciliation?JSON.parse(row.reconciliation):null}:null;
/** Each run can initiate at most one send attempt, including process crashes. */
export class QARegistry{
 constructor(db){this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS qa_attempts(run_id TEXT PRIMARY KEY REFERENCES runs(id),
   status TEXT NOT NULL,expected_count INTEGER NOT NULL,accepted_count INTEGER NOT NULL DEFAULT 0,
   observed_count INTEGER,started_at TEXT NOT NULL,finished_at TEXT,verified_at TEXT,reconciliation TEXT);`);
 }
 get(runId){return parse(this.db.prepare('SELECT * FROM qa_attempts WHERE run_id=?').get(runId))}
 list({limit=100}={}){return this.db.prepare('SELECT * FROM qa_attempts ORDER BY started_at DESC LIMIT ?').all(Math.min(Math.max(limit,1),100)).map(parse)}
 reserve(runId,expectedCount){
  if(!Number.isInteger(expectedCount)||expectedCount<1||expectedCount>25)throw error('QA send requires 1–25 completed synthetic sessions');
  const run=this.db.prepare('SELECT status,report FROM runs WHERE id=?').get(runId);
  if(!run||run.status!=='completed'||!run.report)throw error('QA send requires a completed browser report',409);
  const report=JSON.parse(run.report);
  if(report?.plan?.synthetic!==true||report?.plan?.runId!==runId)throw error('QA send requires an identified synthetic report',409);
  const result=this.db.prepare('INSERT OR IGNORE INTO qa_attempts(run_id,status,expected_count,started_at) VALUES(?,?,?,?)')
   .run(runId,'sending',expectedCount,ISO());
  if(result.changes!==1)throw error('QA event send already attempted for this run',409);
  return this.get(runId);
 }
 finish(runId,{acceptedCount=0}={}){
  const current=this.get(runId);if(!current||current.status!=='sending')throw error('No active QA attempt',409);
  if(!Number.isInteger(acceptedCount)||acceptedCount<0||acceptedCount>current.expectedCount)throw error('Invalid accepted count');
  const status=acceptedCount===current.expectedCount?'transport_accepted':acceptedCount?'partial_transport':'transport_unconfirmed';
  this.db.prepare('UPDATE qa_attempts SET accepted_count=?,status=?,finished_at=? WHERE run_id=?')
   .run(acceptedCount,status,ISO(),runId);
  return this.get(runId);
 }
 reconcile(runId,{observedCount,source,qaMeasurementId}={}){
  const current=this.get(runId);
  if(!current||current.status==='sending')throw error('QA event send not finished',409);
  if(current.acceptedTransportCount<1)throw error('No accepted QA transports to reconcile',409);
  const result=reconcileQAObservations({runId,expectedCount:current.acceptedTransportCount,observedCount,
   observationSource:source,propertyMeasurementId:qaMeasurementId,qaMeasurementId});
  this.db.prepare('UPDATE qa_attempts SET observed_count=?,verified_at=?,reconciliation=? WHERE run_id=?')
   .run(result.reportedCount,result.state==='verified'?ISO():null,JSON.stringify(result),runId);
  return this.get(runId);
 }
}
