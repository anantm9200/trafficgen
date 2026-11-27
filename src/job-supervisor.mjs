/**
 * Process lifecycle supervision for authorized, resource-bounded browser QA.
 * The process group option MUST be used only for detached child processes.
 * A timed-out or cancelled run is never treated as a successful completion.
 */
export function jobTimeoutMs(plan){
 if(!plan||!Number.isInteger(plan.sessions)||plan.sessions<1||plan.sessions>25||
    !Number.isInteger(plan.maxPages)||plan.maxPages<1||plan.maxPages>4||
    !Number.isInteger(plan.intervalSeconds)||plan.intervalSeconds<0||plan.intervalSeconds>120||
    !Number.isInteger(plan.dwellSeconds)||plan.dwellSeconds<0||plan.dwellSeconds>60){
  throw new Error('Invalid bounded browser plan');
 }
 // Upper bound accounts for navigation timeout, page interactions and configured dwell.
 // Inter-session pacing is included even when concurrency remains one.
 const pageBudget=20_000+Math.min(plan.dwellSeconds,12)*1000+6_000;
 const steps=Array.isArray(plan.requestedJourney)?plan.requestedJourney:null;
 const explicitBudget=steps?.reduce((ms,step)=>{
  if(step.action==='navigate')return ms+26_000;
  if(step.action==='assert')return ms+5_000;
  if(step.action==='scroll')return ms+3_000;
  if(step.action==='dwell')return ms+Math.min(30,Math.max(0,step.seconds||0))*1000+1_000;
  return ms+5_000;
 },0);
 const sessionBudget=(steps?explicitBudget:plan.maxPages*pageBudget)+15_000;
 const total=45_000+plan.sessions*sessionBudget+(plan.sessions-1)*plan.intervalSeconds*1000;
 return Math.min(7_200_000,Math.max(60_000,total));
}

export function terminateChild(child,signal='SIGTERM',{processGroup=false}={}){
 if(!child||!child.pid||child.exitCode!==null||child.signalCode!==null)return false;
 if(processGroup&&process.platform!=='win32'){
  try{process.kill(-child.pid,signal);return true}catch(e){if(e?.code!=='ESRCH')return false}
 }
 try{return child.kill(signal)}catch{return false}
}

/**
 * Returns a controller immediately so shutdown and HTTP cancellation can stop the child.
 * `done` always resolves after the child has closed or emitted a spawn error.
 */
export function superviseChild(child,{timeoutMs,graceMs=2000,processGroup=false}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>7_200_000)throw new Error('Invalid watchdog timeout');
 if(!Number.isFinite(graceMs)||graceMs<1||graceMs>30_000)throw new Error('Invalid termination grace');
 let stopReason=null,settled=false,timeoutTimer,escalateTimer;
 let settle;
 const done=new Promise(resolve=>{settle=resolve});
 const clear=()=>{clearTimeout(timeoutTimer);clearTimeout(escalateTimer)};
 const finish=(code,signal,error=null)=>{
  if(settled)return;
  settled=true;clear();
  settle({exitCode:code,signal,stopReason,error});
 };
 child.once('close',(code,signal)=>finish(code,signal));
 child.once('error',error=>finish(-1,null,String(error?.message||error).slice(0,250)));
 function stop(reason='cancelled'){
  if(settled||stopReason)return false;
  if(!['cancelled','timeout','shutdown'].includes(reason))throw new Error('Invalid worker stop reason');
  stopReason=reason;
  terminateChild(child,'SIGTERM',{processGroup});
  escalateTimer=setTimeout(()=>terminateChild(child,'SIGKILL',{processGroup}),graceMs);
  escalateTimer.unref?.();
  return true;
 }
 timeoutTimer=setTimeout(()=>stop('timeout'),timeoutMs);
 timeoutTimer.unref?.();
 return {done,stop,get stopReason(){return stopReason}};
}
