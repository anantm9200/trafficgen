import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {allowCampaignRoute} from '../src/campaign-routes.mjs';
import {relayCampaignViaDgx} from '../src/campaign-gateway.mjs';
import handler from '../api/campaign-gateway.js';

const UUID=randomUUID(),KEY='test-campaign-api-key-at-least-32-bytes';
const env={DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com',TG_DGX_JOB_TOKEN:'t'.repeat(40),
 CF_ACCESS_CLIENT_ID:'access-id',CF_ACCESS_CLIENT_SECRET:'access-secret'};

test('gateway allowlist permits expected methods and specific UUID paths',()=>{
 for(const [route,method] of [['campaigns','GET'],['campaigns','POST'],['campaigns/'+UUID,'GET'],
  ['campaigns/'+UUID+'/status','PATCH'],['campaigns/'+UUID+'/run','POST'],['runs','GET'],
  ['runs/'+UUID+'/refresh','POST'],['runs/'+UUID+'/cancel','POST'],['qa/runs/'+UUID+'/verify','POST'],
  ['qa/runs/'+UUID+'/send','POST'],['qa/health','GET'],['worker-health','GET'],['insights','GET'],
  ['runs.csv','GET'],['scheduler/tick','POST']])assert.ok(allowCampaignRoute(route,method),route+' '+method);
 for(const route of ['http://other.test','../jobs','campaigns/../runs','campaigns//x','campaigns/%2e%2e','campaigns?all=true',
  'jobs','health','campaigns/'+UUID+'/delete','runs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','qa/runs/'+UUID+'/delete','campaigns/'])
  assert.equal(allowCampaignRoute(route,'GET'),false,route);
 assert.equal(allowCampaignRoute('campaigns','DELETE'),false);
 assert.equal(allowCampaignRoute('runs.csv','POST'),false);
 assert.equal(allowCampaignRoute('scheduler/tick','GET'),false);
});

test('Vercel relay only reaches exact approved host and sends service identity, never client credentials',async()=>{
 let seen;
 const result=await relayCampaignViaDgx('campaigns',{env,fetchImpl:async(url,opts)=>{
  seen={url,opts};return new Response(JSON.stringify({ok:true,campaigns:[]}),{status:200,
   headers:{'content-type':'application/json'}});
 }});
 assert.equal(result.status,200);assert.deepEqual(result.data.campaigns,[]);
 assert.equal(seen.url,'https://trafficgen-dgx-spark.iagatlas.com/campaign-api/campaigns');
 assert.equal(seen.opts.headers.authorization,'Bearer '+env.TG_DGX_JOB_TOKEN);
 assert.equal(seen.opts.headers['CF-Access-Client-Secret'],env.CF_ACCESS_CLIENT_SECRET);
 assert.equal(seen.opts.redirect,'manual');
 await assert.rejects(()=>relayCampaignViaDgx('jobs',{env,fetchImpl:async()=>{throw Error('Should not fetch')}}),/Unsupported/);
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env:{...env,DGX_API_URL:'https://another.example'}}),/Approved/);
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env:{...env,TG_DGX_JOB_TOKEN:''}}),/authentication/);
});

test('gateway rejects redirects, bad content, large data and oversized submissions',async()=>{
 const reply=(body,status=200,headers={'content-type':'application/json'})=>new Response(body,{status,headers});
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env,fetchImpl:async()=>reply('',302,{location:'https://evil.example'})}),/redirect/);
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env,fetchImpl:async()=>reply('<html/>',200,{'content-type':'text/html'})}),/content type/);
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env,fetchImpl:async()=>reply('{bad json')}),/invalid JSON/);
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env,fetchImpl:async()=>reply('{}')}),/response invalid/);
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{method:'POST',body:{x:'x'.repeat(17000)},env,fetchImpl:async()=>reply('{}')}),/body too large/);
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env,fetchImpl:async()=>reply(JSON.stringify({ok:true}),200,{'content-type':'application/json','content-length':'3000000'})}),/too large/);
});

test('serverless handler authenticates before routing and returns JSON and synthetic-only CSV',async()=>{
 const saved={...process.env},oldFetch=globalThis.fetch;
 Object.assign(process.env,{...env,TG_API_KEY:KEY});
 let fetches=0;
 globalThis.fetch=async (url)=>{
  fetches++;
  return url.endsWith('/runs.csv')?new Response('synthetic,completed\n',{headers:{'content-type':'text/csv'}}):
   new Response(JSON.stringify({ok:true,campaigns:[]}),{headers:{'content-type':'application/json'}});
 };
 const call=async(route,method='GET',authorization='Bearer '+KEY)=>{
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(code){this.statusCode=code;return this},
   json(body){this.body=body;return this},send(body){this.body=body;return this}};
  await handler({method,query:{route},headers:{authorization}},res);return res;
 };
 try{
  assert.equal((await call('campaigns','GET','Bearer bad')).statusCode,401);
  assert.equal(fetches,0);
  assert.equal((await call('jobs')).statusCode,404);
  assert.equal(fetches,0);
  const good=await call('campaigns');assert.equal(good.statusCode,200);
  assert.deepEqual(good.body.campaigns,[]);
  const csv=await call('runs.csv');assert.equal(csv.statusCode,200);
  assert.match(csv.headers['Content-Disposition'],/synthetic-runs/);
  assert.equal(csv.body,'synthetic,completed\n');
  assert.equal(fetches,2);
 }finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved)}
});

test('an old DGX worker 404 is identified as missing Campaign API, not bad workspace key',async()=>{
 const oldWorker=async()=>new Response(JSON.stringify({ok:false,error:'Not found'}),{
  status:404,headers:{'content-type':'application/json'}});
 await assert.rejects(()=>relayCampaignViaDgx('campaigns',{env,fetchImpl:oldWorker}),
  e=>e.status===503&&/DGX Campaign API route missing/.test(e.message));
 const legitimate=await relayCampaignViaDgx('campaigns/'+UUID,{env,fetchImpl:oldWorker});
 assert.equal(legitimate.status,404);
});
