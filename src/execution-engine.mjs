import {performance} from 'node:perf_hooks';

/** Resource-bounded execution for verified-site QA browser journeys. */
const abortError=()=>Object.assign(new Error('Execution cancelled'),{name:'AbortError'});
export async function delay(ms,signal){
 if(signal?.aborted)throw abortError();
 if(ms<=0)return;
 await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);
  const abort=()=>{clearTimeout(t);signal?.removeEventListener('abort',abort);reject(abortError())};
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
 });
}
export function summarizeMs(values){
 const sorted=values.filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
 const pct=p=>sorted.length?Math.round(sorted[Math.ceil(sorted.length*p)-1]):null;
 return {count:sorted.length,p50Ms:pct(.5),p95Ms:pct(.95),maxMs:sorted.length?Math.round(sorted.at(-1)):null};
}
export function assertExecutionBudget({sessions,concurrency,intervalMs}){
 if(!Number.isInteger(sessions)||sessions<1||sessions>25)throw new Error('sessions must be 1..25');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw new Error('concurrency must be 1..3');
 if(!Number.isInteger(intervalMs)||intervalMs<0||intervalMs>120000)throw new Error('Invalid pacing interval');
 return Math.min(sessions,concurrency);
}

/**
 * Run at most `concurrency` isolated sessions, with a single serialized pacing gate.
 * An aborted or failed session never initiates an unbounded retry.
 * `run(index)` is responsible for creating its own clean browser context.
 */
export async function runPacedSessions({sessions,concurrency,intervalMs,run,signal,shouldStop=()=>false,clock=()=>performance.now(),sleep=delay,onSession}={}){
 const slots=assertExecutionBudget({sessions,concurrency,intervalMs});
 if(typeof run!=='function')throw new TypeError('run must be a function');
 const results=new Array(sessions),durations=[],starts=[],errors=[];
 let cursor=0,active=0,peakActive=0, stopped=false, nextAllowed=null, gate=Promise.resolve();
 const startedAt=clock();
 async function reserveStart(){
  let release;
  const previous=gate;
  gate=new Promise(resolve=>{release=resolve});
  await previous;
  try{
   if(signal?.aborted||shouldStop())return false;
   const now=clock();
   const wait=Math.max(0,(nextAllowed??now)-now);
   if(wait)await sleep(wait,signal);
   if(signal?.aborted||shouldStop())return false;
   nextAllowed=clock()+intervalMs;
   return true;
  }finally{release();}
 }
 async function worker(){
  while(!stopped&&!signal?.aborted&&!shouldStop()){
   const index=cursor++;
   if(index>=sessions)return;
   let permitted;
   try{permitted=await reserveStart();}
   catch(error){if(error?.name==='AbortError'){stopped=true;return;}throw error;}
   if(!permitted){stopped=true;return;}
   const t=clock();starts.push(t);active++;peakActive=Math.max(peakActive,active);
   onSession?.({phase:'started',index,active});
   try{
    results[index]=await run(index,signal);
    if(shouldStop())stopped=true;
   }catch(error){
    const reason=String(error?.message??error).slice(0,250);
    results[index]={index:index+1,ok:false,error:reason,pages:[],jsErrors:[],httpErrors:[],brokenImages:0,analyticsRequests:[]};
    errors.push({index:index+1,reason});
    if(error?.name==='AbortError'||shouldStop())stopped=true;
   }finally{
    durations.push(Math.max(0,clock()-t));active--;
    onSession?.({phase:'finished',index,active,result:results[index]});
   }
  }
 }
 await Promise.all(Array.from({length:slots},()=>worker()));
 const completed=results.filter(v=>v!==undefined);
 return {results,metrics:{requested:sessions,started:starts.length,finished:completed.length,
  skipped:sessions-starts.length,peakActive,stoppedEarly:stopped||signal?.aborted===true||shouldStop(),
  wallMs:Math.round(clock()-startedAt),sessionMs:summarizeMs(durations),
  startSpacingMs:summarizeMs(starts.slice(1).map((t,i)=>t-starts[i])),errors}};
}

/** Browser process reuse is per-job, not cross-job. Contexts are always isolated. */
export async function withBrowser({launch,execute,clock=()=>performance.now()}={}){
 if(typeof launch!=='function'||typeof execute!=='function')throw new TypeError('Browser lifecycle requires launch and execute');
 const before=clock();
 const browser=await launch();
 const startupMs=Math.round(clock()-before);
 try{return {value:await execute(browser),startupMs};}
 finally{await browser.close();}
}
export async function withCleanContext(browser,options,execute){
 const context=await browser.newContext(options);
 try{return await execute(context);}
 finally{await context.close();}
}
