import {scrubReport} from './report-storage.mjs';

const states=new Set(['queued','running','completed','failed','cancelled']);
const terminal=new Set(['completed','failed','cancelled']);
const error=(message,status=502)=>Object.assign(new Error(message),{status});

/** Reconcile only observed remote worker evidence; never synthesize run success. */
export async function reconcileWorkerRun(store,runId,lookupWorkerJob){
 const run=store.getRun(runId);
 if(!run)throw error('Run not found',404);
 if(terminal.has(run.status))return {run,unchanged:true};
 if(!run.workerJobId||typeof lookupWorkerJob!=='function')throw error('Worker status integration is not configured',503);
 const remote=await lookupWorkerJob(run.workerJobId);
 if(remote?.ok!==true||remote.job?.id!==run.workerJobId)throw error('Worker job identity mismatch');
 const state=remote.job.status;
 if(!states.has(state))throw error('Invalid worker status');
 const report=remote.job.report?scrubReport(remote.job.report):null;
 if(state==='completed'&&!report)throw error('Completed job has no report');
 if(report&&(report.plan?.runId!==runId||report.plan?.synthetic!==true))
  throw error('Worker report identity or synthetic classification mismatch');
 if(report&&state!=='completed')throw error('Incomplete worker job cannot carry a final report');
 // The worker may be slightly ahead/behind the local status; do not regress running to queued.
 if(run.status==='running'&&state==='queued')return {run,unchanged:true};
 if(run.status===state&&!report)return {run,unchanged:true};
 return {run:store.updateRun(runId,state,{workerJobId:run.workerJobId,report,error:remote.job.error}),unchanged:false};
}

/** Read-side/background reconciliation is strictly bounded and never dispatches browser jobs. */
export async function reconcilePendingRuns({store,lookupWorkerJob,limit=3}={}){
 if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('Invalid reconciliation limit');
 const pending=store.allRuns({limit:100}).filter(r=>(r.status==='queued'||r.status==='running')&&r.workerJobId).slice(0,limit);
 const outcome={checked:0,changed:0,errors:0};
 for(const r of pending){
  outcome.checked++;
  try{const next=await reconcileWorkerRun(store,r.id,lookupWorkerJob);if(!next.unchanged)outcome.changed++}
  catch{outcome.errors++}
 }
 return outcome;
}
