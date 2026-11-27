import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignStore} from '../src/campaign-store.mjs';
import {CampaignController} from '../src/campaign-controller.mjs';

const NOW=Date.parse('2026-11-18T08:00:00.000Z');
const TOKEN='tg_0123456789abcdefghij';
const draft=(opts={})=>({siteUrl:'https://example.org',name:'Site regression',journey:[{action:'navigate',path:'/check'},{action:'assert',selector:'h1'}],
 devices:['desktop'],regions:['AE'],sessions:1,concurrency:1,intervalSeconds:8,analyticsMode:'observe-only',...opts});
const recurring=()=>draft({schedule:{type:'recurring',startAt:'2026-11-18T00:00:00Z',endAt:'2026-11-20T00:00:00Z',everyMinutes:30,dailyBudget:2}});
const fixture=()=>{const store=new CampaignStore();const calls=[];const verify=[];
 const controller=new CampaignController({store,
 verifySite:async(url,token)=>{verify.push({url,token});if(token!==TOKEN)throw new Error('Ownership missing');return {verified:true}},
 dispatchWorker:async plan=>{calls.push(plan);return {ok:true,job:{id:'remote-'+calls.length}}},
 siteCredentials:()=>({verificationToken:TOKEN})});
 return {store,controller,calls,verify};};

test('campaigns validate, persist, change states; never store proof token',()=>{
 const {store}=fixture();const c=store.create(draft(),{now:NOW});
 assert.equal(c.status,'draft');assert.equal(store.list().length,1);
 assert.equal(store.status(c.id,'active',{now:NOW}).status,'active');
 assert.equal(store.status(c.id,'paused',{now:NOW}).status,'paused');
 assert.equal(store.status(c.id,'archived',{now:NOW}).status,'archived');
 assert.throws(()=>store.status(c.id,'active'),/Archived/);
 assert.ok(!JSON.stringify(store.list()).includes(TOKEN));store.close();
});
test('verified browser dispatch is idempotent and produces synthetic plan',async()=>{
 const {store,controller,calls,verify}=fixture();const c=store.create(draft(),{now:NOW});store.status(c.id,'active',{now:NOW});
 const a=await controller.launch(c.id,{verificationToken:TOKEN,idempotencyKey:'same_action_1',now:NOW});
 const b=await controller.launch(c.id,{verificationToken:TOKEN,idempotencyKey:'same_action_1',now:NOW});
 assert.equal(a.replayed,false);assert.equal(b.replayed,true);assert.equal(a.run.id,b.run.id);
 assert.equal(store.runs(c.id).length,1);assert.equal(calls.length,1);assert.equal(verify.length,2);
 assert.equal(calls[0].synthetic,true);assert.equal(calls[0].analytics.enabled,false);
 assert.equal(calls[0].targetUrl,'https://example.org/check');
 assert.equal(JSON.stringify(store.allRuns()).includes(TOKEN),false);store.close();
});
test('invalid site verification causes no run reservation',async()=>{
 const {store,controller,calls}=fixture();const c=store.create(draft(),{now:NOW});store.status(c.id,'active');
 await assert.rejects(()=>controller.launch(c.id,{verificationToken:'tg_aaaaaaaaaaaaaaaaaaaa',now:NOW}),/Ownership missing/);
 assert.equal(store.runs(c.id).length,0);assert.equal(calls.length,0);store.close();
});
test('worker rejection is a recorded failed run, no phantom completed traffic',async()=>{
 const {store}=fixture();const controller=new CampaignController({store,verifySite:async()=>({verified:true}),dispatchWorker:async()=>({ok:false})});
 const c=store.create(draft(),{now:NOW});store.status(c.id,'active');
 await assert.rejects(()=>controller.launch(c.id,{verificationToken:TOKEN,now:NOW}),/dispatch failed/);
 assert.equal(store.runs(c.id)[0].status,'failed');store.close();
});
test('recurring schedule respects daily sessions budget and no catch-up',async()=>{
 const {store,controller,calls}=fixture();const c=store.create(recurring(),{now:NOW});store.status(c.id,'active',{now:NOW});
 const a=await controller.scheduledTick({now:NOW});assert.equal(a[0].status,'dispatched');
 const b=await controller.scheduledTick({now:NOW+1000});assert.deepEqual(b,[]);
 const d=await controller.scheduledTick({now:NOW+30*60000});assert.equal(d[0].status,'dispatched');
 const e=await controller.scheduledTick({now:NOW+60*60000});assert.deepEqual(e,[]);
 assert.equal(calls.length,2);store.close();
});
test('scheduling is blocked without credentials, does not call worker',async()=>{
 const {store,calls}=fixture();const c=store.create(recurring(),{now:NOW});store.status(c.id,'active');
 const controller=new CampaignController({store,verifySite:async()=>({verified:true}),dispatchWorker:async()=>{throw Error('should not run')}});
 const result=await controller.scheduledTick({now:NOW});assert.equal(result[0].reason,'missing_verification_credential');
 assert.equal(calls.length,0);store.close();
});
test('only completed runs with reports transition to completed; terminal state protected',()=>{
 const {store}=fixture();const c=store.create(draft(),{now:NOW});store.status(c.id,'active');
 const {run}=store.reserveRun(c.id,{idempotencyKey:'manual_1234',now:NOW});
 assert.throws(()=>store.updateRun(run.id,'completed'),/worker report/);
 store.updateRun(run.id,'running',{now:NOW+1000});store.updateRun(run.id,'completed',{now:NOW+2000,report:{plan:{runId:run.id,synthetic:true},summary:{completed:1,passed:1}}});
 assert.equal(store.getRun(run.id).status,'completed');
 assert.throws(()=>store.updateRun(run.id,'failed'),/Terminal run/);store.close();
});
test('daily session reservations count queued and running, not only completed',()=>{
 const {store}=fixture();const c=store.create(draft({sessions:10}),{now:NOW});store.status(c.id,'active');
 store.reserveRun(c.id,{idempotencyKey:'reservation_01',now:NOW});
 store.reserveRun(c.id,{idempotencyKey:'reservation_02',now:NOW});
 assert.throws(()=>store.reserveRun(c.id,{idempotencyKey:'reservation_03',now:NOW}),/budget/);store.close();
});

test('verification adapters must explicitly confirm website ownership',async()=>{
 const {store}=fixture();const controller=new CampaignController({store,verifySite:async()=>({verified:false}),dispatchWorker:async()=>{throw new Error('should never reach worker')}});
 const c=store.create(draft());store.status(c.id,'active');
 await assert.rejects(()=>controller.launch(c.id,{verificationToken:TOKEN}),/could not be confirmed/);
 assert.equal(store.runs(c.id).length,0);store.close();
});
