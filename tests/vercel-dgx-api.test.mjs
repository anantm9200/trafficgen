import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/dgx-jobs.js';
import {randomUUID} from 'node:crypto';
const TOKEN='tg_12345678901234567890',KEY='live_test_api_key_safe_length_123456';
async function call(req){
 let status=null,body=null,headers={};
 const res={setHeader:(k,v)=>headers[k]=v,status:s=>{status=s;return res},json:v=>{body=v;return res}};
 await handler({...req,headers:req.headers||{}},res);
 return {status,body,headers};
}
test('Vercel API refuses anonymous and invalid plans before DNS or worker dispatch',async()=>{
 const prev=process.env.TG_API_KEY;process.env.TG_API_KEY=KEY;
 try{
  assert.equal((await call({method:'GET'})).status,401);
  const bad={targetUrl:'https://example.org/',authorized:true,verificationToken:TOKEN,runId:randomUUID(),
   sessions:1,concurrency:1,intervalSeconds:8,dwellSeconds:8,maxPages:1,countries:['AE'],devices:['desktop'],analytics:{enabled:true}};
  const r=await call({method:'POST',headers:{authorization:'Bearer '+KEY},body:bad});
  assert.equal(r.status,400);assert.equal(r.body.ok,false);assert.match(r.body.error,/GA4 ingestion/);
  const missing={...bad,analytics:{enabled:false},journeyExecutionMode:'explicit-safe-steps'};
  assert.equal((await call({method:'POST',headers:{authorization:'Bearer '+KEY},body:missing})).status,400);
 }finally{if(prev===undefined)delete process.env.TG_API_KEY;else process.env.TG_API_KEY=prev;}
});
test('Vercel API GET relays worker job list through approved gateway with service authentication',async()=>{
 const prev={...process.env},originalFetch=globalThis.fetch;
 const seen=[];
 try{
  Object.assign(process.env,{TG_API_KEY:KEY,DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com',
   TG_DGX_JOB_TOKEN:'w'.repeat(44),CF_ACCESS_CLIENT_ID:'test-id',CF_ACCESS_CLIENT_SECRET:'test-secret'});
  globalThis.fetch=async(url,opts)=>{
   seen.push({url,opts});
   return new Response(JSON.stringify({ok:true,jobs:[]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const r=await call({method:'GET',headers:{authorization:'Bearer '+KEY}});
  assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.deepEqual(r.body.jobs,[]);
  assert.equal(seen.length,1);assert.equal(seen[0].url,'https://trafficgen-dgx-spark.iagatlas.com/jobs');
  assert.equal(seen[0].opts.headers.Authorization,'Bearer '+'w'.repeat(44));
  assert.equal(r.headers['Cache-Control'],'no-store');
 }finally{globalThis.fetch=originalFetch;Object.keys(process.env).filter(k=>!(k in prev)).forEach(k=>delete process.env[k]);Object.assign(process.env,prev);}
});
