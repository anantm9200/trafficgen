import test from 'node:test';
import assert from 'node:assert/strict';
import {compileBrowserPlan} from '../src/campaign-definition.mjs';
import {normalizeJourneyPlan,validateWorkerJourney} from '../src/worker-journey-plan.mjs';
const draft={name:'Owned site QA',siteUrl:'https://example.org',journey:[
 {action:'navigate',path:'/home'},
 {action:'assert',selector:'h1'},
 {action:'scroll',distancePx:400},
 {action:'navigate',path:'/about'},
 {action:'dwell',seconds:1}],regions:['AE'],devices:['desktop'],sessions:1,concurrency:1,intervalSeconds:8};
const normalizer=raw=>({targetUrl:raw.targetUrl,sessions:raw.sessions,countries:raw.countries,devices:raw.devices,
 concurrency:raw.concurrency,intervalSeconds:raw.intervalSeconds,maxPages:raw.maxPages,analytics:{enabled:raw.analytics?.enabled===true},
 authorized:true,verificationToken:raw.verificationToken});
const compiled=()=>compileBrowserPlan(draft,{verificationToken:'tg_1234567890123456'});
test('explicit campaign survives API and DGX queue normalization without silent downgrade',()=>{
 const first=normalizeJourneyPlan(compiled(),normalizer);
 assert.equal(first.journeyExecutionMode,'explicit-safe-steps');
 assert.equal(first.requestedJourney.length,5);
 const second=normalizeJourneyPlan(first,normalizer);
 assert.deepEqual(second.requestedJourney,first.requestedJourney);
 assert.equal(second.requestedJourney[3].path,'/about');
});
test('legacy browser plan stays legacy with no fabricated journey steps',()=>{
 const raw=compiled();delete raw.requestedJourney;delete raw.journeyExecutionMode;
 assert.equal(normalizeJourneyPlan(raw,normalizer).requestedJourney,undefined);
});
test('missing explicit steps or mismatched verified landing fails closed',()=>{
 const raw=compiled();delete raw.requestedJourney;
 assert.throws(()=>normalizeJourneyPlan(raw,normalizer),/missing/);
 const changed={...compiled(),targetUrl:'https://example.org/different'};
 assert.throws(()=>normalizeJourneyPlan(changed,normalizer),/First journey/);
});
test('rejects unsafe paths, mutating actions, excessive pages and collection ingestion',()=>{
 const bad=compiled();bad.requestedJourney[3]={action:'navigate',path:'https://other.org/'};
 assert.throws(()=>normalizeJourneyPlan(bad,normalizer),/unsafe|scope/i);
 const mutating=compiled();mutating.requestedJourney.push({action:'click',selector:'button'});
 assert.throws(()=>normalizeJourneyPlan(mutating,normalizer),/Unsupported/);
 const pages=compiled();pages.maxPages=1;
 assert.throws(()=>normalizeJourneyPlan(pages,normalizer),/page limit/);
 const ingest=compiled();ingest.analytics.enabled=true;
 assert.throws(()=>validateWorkerJourney(ingest,normalizer(ingest)),/GA4 ingestion/);
});
