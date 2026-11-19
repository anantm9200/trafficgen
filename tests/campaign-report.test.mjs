import test from 'node:test';import assert from 'node:assert/strict';
import {aggregateSyntheticCampaignReports,exportSyntheticRunsCSV} from '../src/campaign-report.mjs';
const first={plan:{runId:'abc',synthetic:true},summary:{requested:3,completed:2,passed:1,failed:1,pagesVisited:3,
 javaScriptErrors:1,httpErrors:1,analyticsRequestsObserved:4,performance:{browserStartupMs:120}},
 sessions:[{pages:[{durationMs:20},{durationMs:40}]}]};
const second={plan:{runId:'def',synthetic:true},summary:{requested:2,completed:2,passed:2,failed:0,pagesVisited:2,
 performance:{browserStartupMs:80}},sessions:[{pages:[{durationMs:10}]}],
 qaReconciliation:{state:'verified',source:'authenticated_qa_reporting_api'}};
test('aggregates actual QA records and never calls them users',()=>{
 const r=aggregateSyntheticCampaignReports([first,second]);
 assert.equal(r.requested,5);assert.equal(r.completed,4);assert.equal(r.passed,3);
 assert.equal(r.successRatePercent,75);assert.equal(r.completionRatePercent,80);
 assert.equal(r.browserStartupMs.p50Ms,80);assert.equal(r.verifiedQAReports,1);
 assert.equal(r.synthetic,true);assert.ok(r.warning.includes('not real visitors'));
});
test('empty series uses unknown percentages instead of invented 100%',()=>{
 const r=aggregateSyntheticCampaignReports([]);
 assert.equal(r.successRatePercent,null);assert.equal(r.navigationMs.p95Ms,null);
});
test('CSV contains only allowed fields and prevents spreadsheet formula injection',()=>{
 const data={...first,plan:{...first.plan,runId:'=HYPERLINK("bad")'},verificationToken:'secret'};
 const csv=exportSyntheticRunsCSV([data]);
 assert.ok(csv.includes("'=HYPERLINK"));assert.ok(!csv.includes('secret'));
 assert.ok(!csv.includes('visitor_count'));
});
test('refuses report data that explicitly claims to be non-synthetic',()=>{
 assert.throws(()=>aggregateSyntheticCampaignReports([{...first,plan:{synthetic:false}}]));
});

test('explicit journey metrics do not invent steps for legacy observations',()=>{
 const explicit={...first,sessions:[{pages:[{durationMs:15}],journey:{steps:[
  {action:'navigate',ok:true,durationMs:15},{action:'assert',ok:false,durationMs:3}]}}]};
 const agg=aggregateSyntheticCampaignReports([explicit,second]);
 assert.equal(agg.explicitJourneySessions,1);
 assert.equal(agg.legacyBrowseSessions,1);
 assert.equal(agg.journeySteps,2);
 assert.equal(agg.journeyStepsPassed,1);
 assert.equal(agg.journeyStepsFailed,1);
 assert.equal(agg.assertionFailures,1);
 assert.equal(agg.journeyStepPassRatePercent,50);
 assert.equal(agg.journeyStepMs.p95Ms,15);
 const csv=exportSyntheticRunsCSV([explicit]);
 assert.match(csv,/journeySteps/);assert.match(csv,/failedSteps/);
});
