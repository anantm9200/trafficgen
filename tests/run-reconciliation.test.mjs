import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignStore} from '../src/campaign-store.mjs';
import {reconcileWorkerRun,reconcilePendingRuns} from '../src/run-reconciliation.mjs';

function setup(){
 const store=new CampaignStore();const campaign=store.create({siteUrl:'https://example.org',journey:[{action:'navigate',path:'/'}],sessions:1});
 store.status(campaign.id,'active');const {run}=store.reserveRun(campaign.id,{idempotencyKey:'reconcile_idempotency_01'});
 store.updateRun(run.id,'queued',{workerJobId:'fake-worker-uuid'});
 return {store,runId:run.id};
}
const response=(id,status,report=null)=>({ok:true,job:{id:'fake-worker-uuid',status,report}});
test('bounded monitor reconciles real completed synthetic reports without dashboard polling',async()=>{
 const {store,runId}=setup();try{
  const job={plan:{runId,synthetic:true,verificationToken:'tg_12345678901234567'},summary:{requested:1,completed:1,passed:1},sessions:[]};
  const metrics=await reconcilePendingRuns({store,lookupWorkerJob:async()=>response(runId,'completed',job)});
  assert.deepEqual(metrics,{checked:1,changed:1,errors:0});
  assert.equal(store.getRun(runId).status,'completed');
  assert.equal(store.getRun(runId).report.plan.verificationToken,'[redacted]');
  const next=await reconcilePendingRuns({store,lookupWorkerJob:async()=>{throw Error('should not be called')}});
  assert.deepEqual(next,{checked:0,changed:0,errors:0});
 }finally{store.close()}
});
test('rejects mismatched run reports and does not mark job completed',async()=>{
 const {store,runId}=setup();try{
  await assert.rejects(()=>reconcileWorkerRun(store,runId,async()=>response(runId,'completed',{plan:{runId:'different',synthetic:true},summary:{},sessions:[]})),/identity/);
  assert.equal(store.getRun(runId).status,'queued');
 }finally{store.close()}
});
test('does not regress a running job to queued',async()=>{
 const {store,runId}=setup();try{
  store.updateRun(runId,'running');
  const r=await reconcileWorkerRun(store,runId,async()=>response(runId,'queued'));
  assert.equal(r.unchanged,true);assert.equal(r.run.status,'running');
 }finally{store.close()}
});
test('bounded monitor tolerates worker failures without inventing completion',async()=>{
 const {store,runId}=setup();try{
  const metrics=await reconcilePendingRuns({store,lookupWorkerJob:async()=>{throw Error('unavailable')}});
  assert.deepEqual(metrics,{checked:1,changed:0,errors:1});
  assert.equal(store.getRun(runId).status,'queued');
  await assert.rejects(()=>reconcilePendingRuns({store,lookupWorkerJob:async()=>{},limit:50}),/limit/);
 }finally{store.close()}
});
