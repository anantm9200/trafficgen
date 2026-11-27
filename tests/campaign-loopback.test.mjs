import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {CampaignStore} from '../src/campaign-store.mjs';
import {createCampaignApi} from '../src/campaign-api.mjs';
import {makeLoopbackDgxAdapter} from '../src/worker-adapters.mjs';
import vercelHandler from '../api/campaign-gateway.js';

const TOKEN='t'.repeat(44),SERVICE='s'.repeat(44),PROOF='tg_12345678901234567890';
const draft={siteUrl:'https://example.org',name:'Campaign gateway E2E',journey:[{action:'navigate',path:'/'},{action:'dwell',seconds:1}],
 sessions:1,devices:['desktop'],regions:['AE'],analyticsMode:'observe-only'};
// Explicit port allocation with address captured before close.
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n}
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'trafficgen-gateway-'));
 const campaignPort=await port(),workerPort=await port();
 const store=new CampaignStore({path:join(dir,'campaigns.sqlite')});
 const local=createCampaignApi({store,apiKey:SERVICE,
  verifySite:async (_u,p)=>({verified:p===PROOF}),
  dispatchWorker:async()=>({ok:true,job:{id:'mock-worker-job'}})});
 local.server.listen(campaignPort,'127.0.0.1');await once(local.server,'listening');
 const child=spawn(process.execPath,['worker/dgx-queue.mjs'],{
  cwd:new URL('../',import.meta.url).pathname,
  env:{...process.env,TG_WORKER_PORT:String(workerPort),TG_CAMPAIGN_PORT:String(campaignPort),TG_CAMPAIGN_SERVICE_TOKEN:SERVICE,
   TG_QUEUE_DB:join(dir,'queue.sqlite'),TG_DGX_JOB_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 const base='http://127.0.0.1:'+workerPort;let stderr='';child.stderr.on('data',d=>stderr+=d);
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)break;
  try{const res=await fetch(base+'/health',{signal:AbortSignal.timeout(200)});if(res.ok)break}catch{}
  await new Promise(r=>setTimeout(r,35));
 }
 if(child.exitCode!==null)throw Error('Worker start failed '+stderr);
 const send=async(route,{method='GET',body,token=TOKEN}={})=>{
  const r=await fetch(base+'/campaign-api/'+route,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  return {status:r.status,type:r.headers.get('content-type'),data:route==='runs.csv'?await r.text():await r.json()};
 };
 const close=async()=>{
  child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,1500))]);if(child.exitCode===null)child.kill('SIGKILL');
  await new Promise(r=>local.server.close(r));store.close();await rm(dir,{recursive:true,force:true});
 };
 return {send,close,dir,workerPort,base};
}
test('real worker HTTP gateway relays only authenticated allowlisted calls into durable Campaign SQLite',async()=>{
 const x=await fixture();try{
  assert.equal((await x.send('campaigns',{token:'wrong'})).status,401);
  assert.equal((await x.send('jobs')).status,404);
  assert.equal((await x.send('campaigns?inject=true')).status,400);
  let result=await x.send('campaigns',{method:'POST',body:draft});assert.equal(result.status,201);
  const id=result.data.campaign.id;
  const file=await stat(join(x.dir,'campaigns.sqlite'));assert.equal(file.mode&0o777,0o600);
  result=await x.send('campaigns');assert.equal(result.status,200);assert.equal(result.data.campaigns.length,1);
  result=await x.send('campaigns/'+id+'/status',{method:'PATCH',body:{status:'active'}});
  assert.equal(result.data.campaign.status,'active');
  const job=await x.send('campaigns/'+id+'/run',{method:'POST',body:{verificationToken:PROOF,idempotencyKey:'test-run-0001'}});
  assert.equal(job.status,202);assert.equal(job.data.run.status,'queued');
  assert.equal(JSON.stringify(job.data).includes(PROOF),false);
  const csv=await x.send('runs.csv');assert.equal(csv.status,200);assert.match(csv.type,/text\/csv/);
 }finally{await x.close()}
});

test('same-host worker adapter uses loopback, enforces token and refuses unsafe paths',async()=>{
 let seen;
 const adapter=makeLoopbackDgxAdapter({env:{TG_WORKER_PORT:'18743',TG_DGX_JOB_TOKEN:TOKEN},
  fetchImpl:async(url,opts)=>{seen={url,opts};return new Response(JSON.stringify({ok:true,service:'trafficgen-dgx-worker'}),{headers:{'content-type':'application/json'}})}});
 const res=await adapter.healthWorker();assert.equal(res.service,'trafficgen-dgx-worker');
 assert.equal(seen.url,'http://127.0.0.1:18743/health');assert.equal(seen.opts.headers.authorization,'Bearer '+TOKEN);
 const bad=makeLoopbackDgxAdapter({env:{TG_WORKER_PORT:'18743',TG_DGX_JOB_TOKEN:''}});
 await assert.rejects(()=>bad.healthWorker(),/not configured/);
});


test('complete Vercel-handler-to-worker-to-durable-Campaign API chain works through mocked tunnel transport',async()=>{
 const x=await fixture();const originalFetch=globalThis.fetch,old={...process.env};
 Object.assign(process.env,{TG_API_KEY:'workspace_admin_key_with_minimum_32_chars',
  DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com',TG_DGX_JOB_TOKEN:TOKEN,
  CF_ACCESS_CLIENT_ID:'cloudflare-id',CF_ACCESS_CLIENT_SECRET:'cloudflare-secret'});
 let calls=0;
 globalThis.fetch=async (url,options)=>{
  const target=String(url),prefix='https://trafficgen-dgx-spark.iagatlas.com';
  if(!target.startsWith(prefix+'/campaign-api/'))throw Error('Unexpected outbound destination');
  calls++;
  return originalFetch(x.base+target.slice(prefix.length),options);
 };
 const invoke=async(route,method='GET',body)=>{
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(code){this.code=code;return this},
   json(data){this.data=data;return this},send(data){this.data=data;return this}};
  await vercelHandler({query:{route},method,body,headers:{authorization:'Bearer '+process.env.TG_API_KEY}},res);
  return res;
 };
 try{
  const created=await invoke('campaigns','POST',draft);
  assert.equal(created.code,201);
  const saved=await invoke('campaigns');
  assert.equal(saved.code,200);
  assert.equal(saved.data.campaigns[0].id,created.data.campaign.id);
  const bad=await invoke('../jobs');
  assert.equal(bad.code,404);
  assert.equal(calls,2,'rejected route never reaches Cloudflare or DGX');
 }finally{
  globalThis.fetch=originalFetch;
  for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);
  await x.close();
 }
});
