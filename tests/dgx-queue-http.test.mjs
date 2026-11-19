import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';

const root=new URL('../',import.meta.url).pathname;
async function freePort(){return new Promise((resolve,reject)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))});s.once('error',reject)})}
async function startQueue(){
 const dir=await mkdtemp(join(tmpdir(),'trafficgen-queue-v4-')),port=await freePort(),token='q'.repeat(44);
 const child=spawn(process.execPath,['worker/dgx-queue.mjs'],{cwd:root,env:{...process.env,TG_WORKER_PORT:String(port),TG_QUEUE_DB:join(dir,'queue.sqlite'),TG_DGX_JOB_TOKEN:token},stdio:['ignore','pipe','pipe']});
 let output='';child.stderr.on('data',d=>{output+=d.toString()});
 const url='http://127.0.0.1:'+port;
 for(let i=0;i<90;i++){
  if(child.exitCode!==null)break;
  try{const r=await fetch(url+'/health',{signal:AbortSignal.timeout(700)});if(r.ok)return {url,token,child,dir,stop:async()=>{
   child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,1500))]);if(child.exitCode===null)child.kill('SIGKILL');await rm(dir,{recursive:true,force:true});
  }}}catch{}
  await new Promise(r=>setTimeout(r,40));
 }
 child.kill('SIGKILL');await rm(dir,{recursive:true,force:true});throw Error('DGX queue failed to boot: '+output.slice(0,600));
}
test('actual DGX HTTP queue boots, reports metrics, authenticates and rejects unsafe dispatch before DNS',async()=>{
 const x=await startQueue();try{
  const perms=await stat(join(x.dir,'queue.sqlite'));
  assert.equal(perms.mode&0o777,0o600,'queue database must not expose persistent proof tokens');
  const health=await (await fetch(x.url+'/health')).json();
  assert.equal(health.ok,true);assert.equal(health.service,'trafficgen-dgx-worker');
  assert.equal(health.metrics.counts.queued,0);
  assert.equal((await fetch(x.url+'/jobs')).status,401);
  assert.equal((await fetch(x.url+'/jobs',{headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.deepEqual((await (await fetch(x.url+'/jobs',{headers:{Authorization:'Bearer '+x.token}})).json()).jobs,[]);
  const post=async body=>{
   const r=await fetch(x.url+'/jobs',{method:'POST',headers:{Authorization:'Bearer '+x.token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};
  };
  const token='tg_12345678901234567890';
  const base={targetUrl:'https://example.org/',authorized:true,verificationToken:token,runId:randomUUID(),
   sessions:1,concurrency:1,intervalSeconds:8,dwellSeconds:8,maxPages:2,countries:['AE'],devices:['desktop'],analytics:{enabled:false}};
  assert.equal((await post({...base,analytics:{enabled:true}})).status,400);
  assert.equal((await post({...base,runId:'bad-identity'})).status,400);
  assert.equal((await post({...base,journeyExecutionMode:'explicit-safe-steps'})).status,400);
  assert.equal((await post({...base,requestedJourney:[{action:'navigate',path:'/'},{action:'click',selector:'button'}],journeyExecutionMode:'explicit-safe-steps'})).status,400);
  const jobs=await (await fetch(x.url+'/jobs',{headers:{Authorization:'Bearer '+x.token}})).json();
  assert.equal(jobs.jobs.length,0);
 }finally{await x.stop()}
});
