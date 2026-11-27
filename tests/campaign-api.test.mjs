import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {CampaignStore} from '../src/campaign-store.mjs';
import {createCampaignApi} from '../src/campaign-api.mjs';
import {makeDnsOwnershipAdapter,makeDgxAdapter} from '../src/worker-adapters.mjs';

const KEY='local_integration_key_01234567890123456789',TOKEN='tg_12345678901234567890';
const draft={siteUrl:'https://example.org',name:'Main navigation QA',journey:[{action:'navigate',path:'/'},{action:'dwell',seconds:1}],sessions:1,
 devices:['desktop'],regions:['AE'],intervalSeconds:8,analyticsMode:'observe-only'};
async function setup({failDispatch=false,qaEnabled=false}={}){
 const store=new CampaignStore(),sent=[];
 const api=createCampaignApi({store,apiKey:KEY,
  ...(qaEnabled?{qaConfig:{qaMeasurementId:'G-QATEST1234',productionMeasurementId:'G-PROD1234',qaApiSecret:'qa-secret-1234567'},
    qaReportingConfig:{qaPropertyId:'123456789'},
    sendQABatch:async(_,run)=>({state:'transport_accepted',acceptedCount:run.count,processed:false,reportVisible:false}),
    readQAReport:async()=>({source:'authenticated_qa_reporting_api',propertyId:'123456789',observedCount:1}),
    verifyQAStream:async()=>({verified:true,source:'analytics_admin_api',propertyId:'123456789',measurementId:'G-QATEST1234'})}:{}),
  verifySite:async(url,token)=>{if(token!==TOKEN)throw Object.assign(new Error('Proof rejected'),{status:403});return {verified:true}},
  dispatchWorker:async plan=>{sent.push(plan);return failDispatch?{ok:false}:{ok:true,job:{id:'worker-abc'}}},
  lookupWorkerJob:async()=>({ok:true,job:{id:'worker-abc',status:'completed',report:{plan:{runId:sent[0].runId,synthetic:true,verificationToken:TOKEN},summary:{requested:1,completed:1,passed:1,failed:0,pagesVisited:1},sessions:[]}}}),
  cancelWorkerJob:async()=>({ok:true,job:{id:'worker-abc',status:'cancelled'}})});
 api.server.listen(0,'127.0.0.1');await once(api.server,'listening');
 const url='http://127.0.0.1:'+api.server.address().port;
 async function req(path,{method='GET',body,key=KEY}={}){
  const r=await fetch(url+path,{method,headers:{...(key?{authorization:'Bearer '+key}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();return {status:r.status,data};
 }
 return {req,api,store,sent,close:()=>new Promise(r=>api.server.close(()=>{store.close();r()}))};
}
test('API requires authentication for campaign data',async()=>{
 const x=await setup();try{
  assert.equal((await x.req('/api/campaigns',{key:null})).status,401);
  assert.equal((await x.req('/api/campaigns',{key:'bad'})).status,401);
  assert.equal((await x.req('/api/health',{key:null})).data.analytics,'production-collection-blocked');
 }finally{await x.close()}
});
test('API CRUD -> verified dispatch -> remote completion -> aggregation; no leaked proof token',async()=>{
 const x=await setup();try{
  let result=await x.req('/api/campaigns',{method:'POST',body:draft});assert.equal(result.status,201);
  const id=result.data.campaign.id;
  result=await x.req('/api/campaigns/'+id+'/status',{method:'PATCH',body:{status:'active'}});assert.equal(result.data.campaign.status,'active');
  const body={verificationToken:TOKEN,idempotencyKey:'test_action_09'};
  const dispatched=await x.req('/api/campaigns/'+id+'/run',{method:'POST',body});
  assert.equal(dispatched.status,202);assert.equal(dispatched.data.run.status,'queued');
  assert.equal(x.sent.length,1);assert.equal(x.sent[0].analytics.enabled,false);
  const repeat=await x.req('/api/campaigns/'+id+'/run',{method:'POST',body});
  assert.equal(repeat.data.replayed,true);assert.equal(x.sent.length,1);
  const refreshed=await x.req('/api/runs/'+dispatched.data.run.id+'/refresh',{method:'POST'});
  assert.equal(refreshed.data.run.status,'completed');
  assert.equal(JSON.stringify(refreshed.data).includes(TOKEN),false);
  const insights=await x.req('/api/insights');assert.equal(insights.data.summary.passed,1);
  assert.equal(insights.data.summary.synthetic,true);
  const visible=await x.req('/api/campaigns');assert.equal(visible.data.campaigns.length,1);
 }finally{await x.close()}
});
test('API validates state, rejects missing proof and does not submit worker jobs',async()=>{
 const x=await setup();try{
  const c=(await x.req('/api/campaigns',{method:'POST',body:draft})).data.campaign;
  assert.equal((await x.req('/api/campaigns/'+c.id+'/run',{method:'POST',body:{verificationToken:TOKEN}})).status,409);
  await x.req('/api/campaigns/'+c.id+'/status',{method:'PATCH',body:{status:'active'}});
  assert.equal((await x.req('/api/campaigns/'+c.id+'/run',{method:'POST',body:{verificationToken:'tg_aaaaaaaaaaaaaaaaaaaa'}})).status,403);
  assert.equal(x.sent.length,0);
 }finally{await x.close()}
});
test('production analytics mode cannot be enabled through campaign dispatch',async()=>{
 const x=await setup();try{
  const bad={...draft,analyticsMode:'production'};
  assert.equal((await x.req('/api/campaigns',{method:'POST',body:bad})).status,400);
 }finally{await x.close()}
});
test('DNS owner verification checks both public IP and exact TXT token',async()=>{
 const verify=makeDnsOwnershipAdapter({lookupFn:async()=>[{address:'93.184.215.14',family:4}],
  resolveTxtFn:async name=>{assert.equal(name,'_visitorlab.example.org');return [['visitorlab-verification='+TOKEN]]}});
 assert.equal((await verify('https://example.org/',TOKEN)).verified,true);
 const bad=makeDnsOwnershipAdapter({lookupFn:async()=>[{address:'10.0.0.1',family:4}],resolveTxtFn:async()=>[]});
 await assert.rejects(()=>bad('https://example.org',TOKEN),/private\/reserved/);
});
test('DGX gateway allowlist rejects unexpected hosts and missing credentials',async()=>{
 assert.throws(()=>makeDgxAdapter({env:{DGX_API_URL:'https://evil.example/'}}),/approved origin/);
 const adapter=makeDgxAdapter({env:{DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com/'}});
 await assert.rejects(()=>adapter.dispatchWorker({}),/not configured/);
});

test('GA4 QA route sends only to configured isolated property and verifies via trusted read adapter',async()=>{
 const x=await setup({qaEnabled:true});try{
  const c=(await x.req('/api/campaigns',{method:'POST',body:draft})).data.campaign;
  await x.req('/api/campaigns/'+c.id+'/status',{method:'PATCH',body:{status:'active'}});
  const r=(await x.req('/api/campaigns/'+c.id+'/run',{method:'POST',body:{verificationToken:TOKEN}})).data.run;
  await x.req('/api/runs/'+r.id+'/refresh',{method:'POST'});
  const sent=await x.req('/api/qa/runs/'+r.id+'/send',{method:'POST'});
  assert.equal(sent.status,200);assert.equal(sent.data.qa.status,'transport_accepted');
  assert.equal(sent.data.qa.reconciliation,null);
  assert.equal((await x.req('/api/qa/runs/'+r.id+'/send',{method:'POST'})).status,409);
  const verified=await x.req('/api/qa/runs/'+r.id+'/verify',{method:'POST'});
  assert.equal(verified.status,200);assert.equal(verified.data.qa.reconciliation.state,'verified');
 }finally{await x.close()}
});
