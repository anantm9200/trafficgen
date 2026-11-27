import test from 'node:test';import assert from 'node:assert/strict';
import {validateCampaignDraft,compileBrowserPlan,nextCampaignTick} from '../src/campaign-definition.mjs';
const base={name:'Owned site smoke test',siteUrl:'https://example.org',sessions:2,
 journey:[{action:'navigate',path:'/home'},{action:'scroll',distancePx:600},{action:'dwell',seconds:5},{action:'navigate',path:'/about'}]};
test('normalizes safe same-origin campaign with explicit synthetic classification',()=>{
 const r=validateCampaignDraft(base);
 assert.equal(r.siteUrl,'https://example.org');assert.equal(r.synthetic,true);
 assert.equal(r.journey.length,4);assert.equal(r.analyticsMode,'observe-only');
});
test('rejects unsafe journey navigation, credentialed hosts and mutating actions',()=>{
 assert.throws(()=>validateCampaignDraft({...base,journey:[{action:'navigate',path:'https://other.org/'}]}));
 assert.throws(()=>validateCampaignDraft({...base,journey:[{action:'navigate',path:'/checkout'}]}));
 assert.throws(()=>validateCampaignDraft({...base,journey:[{action:'navigate',path:'/'},{action:'click',selector:'button'}]}));
 assert.throws(()=>validateCampaignDraft({...base,siteUrl:'https://user:pass@example.org'}));
});
test('requires a verified-site credential at dispatch and marks executable explicit journey',()=>{
 assert.throws(()=>compileBrowserPlan(base,{}));
 const p=compileBrowserPlan(base,{verificationToken:'tg_1234567890123456'});
 assert.equal(p.authorized,true);assert.equal(p.analytics.enabled,false);
 assert.equal(p.targetUrl,'https://example.org/home');
 assert.equal(p.journeyExecutionMode,'explicit-safe-steps');
 assert.equal(p.requestedJourney.length,4);
});
test('limits browser concurrency, session budgets and unsupported analytics mode',()=>{
 assert.throws(()=>validateCampaignDraft({...base,concurrency:3}));
 assert.throws(()=>validateCampaignDraft({...base,sessions:500}));
 assert.throws(()=>validateCampaignDraft({...base,analyticsMode:'production-ga4'}));
});
test('recurring schedules only run in bounded windows with daily budgets',()=>{
 const r={...base,schedule:{type:'recurring',startAt:'2026-11-19T00:00:00Z',endAt:'2026-11-20T00:00:00Z',everyMinutes:30,dailyBudget:4}};
 assert.deepEqual(nextCampaignTick(r,{now:Date.parse('2026-11-18T23:00:00Z')}),{due:false,reason:'not_due',nextAt:'2026-11-19T00:00:00.000Z'});
 assert.equal(nextCampaignTick(r,{now:Date.parse('2026-11-19T01:00:00Z')}).due,true);
 assert.equal(nextCampaignTick(r,{now:Date.parse('2026-11-19T01:00:00Z'),completedSessionsToday:4}).reason,'daily_budget');
 assert.equal(nextCampaignTick(r,{now:Date.parse('2026-11-21T00:00:00Z')}).reason,'schedule_expired');
});
test('rejects non-30-minute cadence, invalid schedule windows and over-budget runs',()=>{
 const schedule={type:'recurring',startAt:'2026-11-19T00:00:00Z',endAt:'2026-11-20T00:00:00Z',everyMinutes:31,dailyBudget:5};
 assert.throws(()=>validateCampaignDraft({...base,schedule}));
 assert.throws(()=>validateCampaignDraft({...base,schedule:{...schedule,everyMinutes:30,dailyBudget:1}}));
 assert.throws(()=>validateCampaignDraft({...base,schedule:{...schedule,everyMinutes:30,endAt:'2027-01-01T00:00:00Z'}}));
});
