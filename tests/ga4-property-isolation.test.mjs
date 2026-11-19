import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {CampaignStore} from '../src/campaign-store.mjs';
import {createCampaignApi} from '../src/campaign-api.mjs';

const apiKey='release_qa_test_key_0000000000000000',verificationToken='tg_abcdefghijklmnopqrstu';
const draft={siteUrl:'https://example.org',name:'Property isolation QA',journey:[{action:'navigate',path:'/'}],sessions:1,
  devices:['desktop'],regions:['AE'],intervalSeconds:8,analyticsMode:'observe-only'};
const cfg={qaMeasurementId:'G-TESTQATEST1',productionMeasurementId:'G-PRODPROD01',qaApiSecret:'a_valid_QA_secret'};
async function fixture(result){
 const store=new CampaignStore();
 const api=createCampaignApi({apiKey,store,qaConfig:cfg,qaReportingConfig:{qaPropertyId:'123456789'},
  verifySite:async()=>({verified:true}),dispatchWorker:async()=>({ok:true,job:{id:'worker-fixture'}}),
  lookupWorkerJob:async()=>({ok:true,job:{id:'worker-fixture',status:'completed',report:{plan:{runId:globalThis.__runId,synthetic:true},summary:{requested:1,completed:1,passed:1},sessions:[]}}}),
  sendQABatch:async(_,run)=>({state:'transport_accepted',acceptedCount:run.count}),readQAReport:async()=>result,
  verifyQAStream:async()=>({verified:true,source:'analytics_admin_api',propertyId:'123456789',measurementId:cfg.qaMeasurementId})});
 api.server.listen(0,'127.0.0.1');await once(api.server,'listening');
 const base='http://127.0.0.1:'+api.server.address().port;
 const request=async(path,method='GET',body)=>{const res=await fetch(base+path,{method,headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()}};
 const c=(await request('/api/campaigns','POST',draft)).data.campaign;
 await request('/api/campaigns/'+c.id+'/status','PATCH',{status:'active'});
 const run=(await request('/api/campaigns/'+c.id+'/run','POST',{verificationToken,idempotencyKey:'release_qa_test_01'})).data.run;
 globalThis.__runId=run.id;
 await request('/api/runs/'+run.id+'/refresh','POST');
 await request('/api/qa/runs/'+run.id+'/send','POST');
 return {request,run,close:()=>new Promise(resolve=>api.server.close(()=>{store.close();delete globalThis.__runId;resolve()}))};
}
for(const [name,result,status] of [
 ['rejects GA4 QA results from the wrong numeric property', {source:'authenticated_qa_reporting_api',propertyId:'987654321',observedCount:1},502],
 ['rejects spoofed QA source metadata', {source:'not_authenticated',propertyId:'123456789',observedCount:1},502],
 ['rejects invalid processed event counts', {source:'authenticated_qa_reporting_api',propertyId:'123456789',observedCount:NaN},502],
 ['accepts exact QA property with authenticated event evidence', {source:'authenticated_qa_reporting_api',propertyId:'123456789',observedCount:1},200]
])test(name,async()=>{const f=await fixture(result);try{const r=await f.request('/api/qa/runs/'+f.run.id+'/verify','POST');assert.equal(r.status,status);if(status===200)assert.equal(r.data.qa.reconciliation.state,'verified');}finally{await f.close()}});
