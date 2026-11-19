import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignStore} from '../src/campaign-store.mjs';
import {QARegistry} from '../src/qa-registry.mjs';
const draft={siteUrl:'https://example.org',journey:[{action:'navigate',path:'/'}],sessions:2,intervalSeconds:8};
function completedFixture(){
 const store=new CampaignStore(),c=store.create(draft);store.status(c.id,'active');
 const {run}=store.reserveRun(c.id,{idempotencyKey:'qa_testing_01'});
 store.updateRun(run.id,'completed',{report:{plan:{runId:run.id,synthetic:true},summary:{requested:2,completed:2,passed:2,failed:0},sessions:[]}});
 return {store,run:store.getRun(run.id),qa:new QARegistry(store.db)};
}
test('QA transport attempt is once per completed synthetic report, reconciled only with authenticated source',()=>{
 const {store,run,qa}=completedFixture();
 qa.reserve(run.id,2);assert.throws(()=>qa.reserve(run.id,2),/already attempted/);
 const first=qa.finish(run.id,{acceptedCount:2});assert.equal(first.status,'transport_accepted');
 assert.equal(first.reconciliation,null);
 const partial=qa.reconcile(run.id,{observedCount:1,source:'authenticated_qa_reporting_api',qaMeasurementId:'G-QATEST123'});
 assert.equal(partial.reconciliation.state,'partial');
 const verified=qa.reconcile(run.id,{observedCount:2,source:'authenticated_qa_reporting_api',qaMeasurementId:'G-QATEST123'});
 assert.equal(verified.reconciliation.state,'verified');
 store.close();
});
test('QA registry refuses unfinished synthetic run and claimed mixed report',()=>{
 const store=new CampaignStore(),qa=new QARegistry(store.db);const c=store.create(draft);store.status(c.id,'active');
 const {run}=store.reserveRun(c.id,{idempotencyKey:'qa_testing_02'});
 assert.throws(()=>qa.reserve(run.id,1),/completed browser report/);store.close();
});
