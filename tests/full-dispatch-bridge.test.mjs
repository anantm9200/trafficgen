import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {compileBrowserPlan} from '../src/campaign-definition.mjs';
import {normalizeForDgx} from '../src/dispatch-bridge.mjs';
import {normalizePlan} from '../src/plan.mjs';
import {queueMetrics} from '../src/worker-metrics.mjs';

const token='tg_testOwnedSiteProof123456789',siteUrl='https://example.org';
const draft={name:'Explicit approved site journey',siteUrl,journey:[
 {action:'navigate',path:'/'},{action:'assert',selector:'h1'},
 {action:'scroll',distancePx:500},{action:'navigate',path:'/about'},{action:'dwell',seconds:1}],
 devices:['desktop'],regions:['AE'],sessions:1,concurrency:1,intervalSeconds:8};
const makePlan=()=>compileBrowserPlan(draft,{verificationToken:token,runId:randomUUID()});

test('real plan normalizer, public API and DGX queue roundtrips preserve exact explicit journey',()=>{
 const raw=makePlan();const first=normalizeForDgx(raw),second=normalizeForDgx(first);
 assert.equal(first.runId,raw.runId);
 assert.equal(second.runId,raw.runId);
 assert.equal(first.journeyExecutionMode,'explicit-safe-steps');
 assert.deepEqual(first.requestedJourney,raw.requestedJourney);
 assert.deepEqual(second.requestedJourney,raw.requestedJourney);
 assert.equal(first.targetUrl,'https://example.org/');
 assert.equal(second.analytics.enabled,false);
 assert.equal(second.synthetic,true);
});
test('normalization rejects invalid identifiers rather than silently changing run identity',()=>{
 assert.throws(()=>normalizeForDgx({...makePlan(),runId:'a'.repeat(36)}),/canonical UUID/);
 assert.throws(()=>normalizePlan({...makePlan(),runId:2}),/canonical UUID/);
});
test('explicit journey rejects missing, out-of-scope, or mismatched steps through both boundaries',()=>{
 const plan=makePlan();
 assert.throws(()=>normalizeForDgx({...plan,requestedJourney:undefined}),/missing/);
 assert.throws(()=>normalizeForDgx({...plan,targetUrl:'https://example.org/different'}),/First journey/);
 assert.throws(()=>normalizeForDgx({...plan,requestedJourney:[{action:'navigate',path:'/'},{action:'click',selector:'button'}]}),/Unsupported/);
 assert.throws(()=>normalizeForDgx({...plan,requestedJourney:[{action:'navigate',path:'/'},{action:'navigate',path:'https://evil.invalid/'}]}),/unsafe|scope/i);
});
test('real dispatch normalization refuses production collection and unbounded concurrency',()=>{
 const plan=makePlan();
 assert.throws(()=>normalizeForDgx({...plan,analytics:{enabled:true}}),/GA4 ingestion/);
 assert.throws(()=>normalizeForDgx({...plan,concurrency:2}),/concurrency/);
 assert.throws(()=>normalizeForDgx({...plan,sessions:26}),/sessions/);
 assert.throws(()=>normalizeForDgx({...plan,intervalSeconds:1}),/intervalSeconds/);
});
test('legacy plans continue to work but are never labeled explicit',()=>{
 const raw=makePlan();delete raw.requestedJourney;delete raw.journeyExecutionMode;
 const normalized=normalizeForDgx(raw);
 assert.equal(normalized.requestedJourney,undefined);
 assert.equal(normalized.synthetic,true);
});
test('queue metrics measure bounded historical timing without assuming actual geography',()=>{
 const rows=[{status:'queued',created_at:'2026-11-18T00:00:00.000Z'},
  {status:'completed',created_at:'2026-11-18T00:00:01.000Z',started_at:'2026-11-18T00:00:03.000Z',finished_at:'2026-11-18T00:00:05.000Z'}];
 const m=queueMetrics(rows,Date.parse('2026-11-18T00:00:10.000Z'));
 assert.deepEqual(m.counts,{queued:1,running:0,completed:1,failed:0,cancelled:0});
 assert.equal(m.oldestQueuedMs,10000);
 assert.equal(m.queueWait.p95Ms,2000);
 assert.equal(m.runTime.p95Ms,2000);
});
