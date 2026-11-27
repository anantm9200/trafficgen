import test from 'node:test';import assert from 'node:assert/strict';
import {validateIsolatedQA,createQAEvent,sendIsolatedQAEvent,reconcileQAObservations} from '../src/qa-analytics.mjs';
const config={qaMeasurementId:'G-QATEST123',productionMeasurementId:'G-PROD12345',qaApiSecret:'qa_secret_never_report'};
const runId='12345678-1234-1234-1234-123456789012';
test('requires explicit separate QA and production destinations',()=>{
 assert.equal(validateIsolatedQA(config).qaMeasurementId,config.qaMeasurementId);
 assert.throws(()=>validateIsolatedQA({...config,productionMeasurementId:config.qaMeasurementId}));
 assert.throws(()=>validateIsolatedQA({...config,productionMeasurementId:''}));
});
test('creates clearly synthetic event without acquisition/click claims',()=>{
 const p=createQAEvent({runId,sessionNumber:1,elapsedMs:1000,clientId:'known-qa-id-123'});
 assert.equal(p.events[0].name,'trafficgen_qa_session');
 assert.equal(p.events[0].params.tg_synthetic,1);
 assert.equal(p.events[0].params.traffic_type,'internal');
 assert.ok(!('page_view' in p.events[0]));
});
test('sends only to explicit QA destination and never discloses secret in result',async()=>{
 let url,opts;
 const r=await sendIsolatedQAEvent(config,{runId},{fetchImpl:async(u,o)=>{url=new URL(u);opts=o;return {ok:true,status:204}}});
 assert.equal(url.searchParams.get('measurement_id'),'G-QATEST123');
 assert.equal(JSON.parse(opts.body).events[0].name,'trafficgen_qa_session');
 assert.equal(r.state,'transport_accepted');
 assert.equal(r.reportVisible,false);
 assert.equal(JSON.stringify(r).includes(config.qaApiSecret),false);
});
test('debug acceptance does not imply event was processed',async()=>{
 const r=await sendIsolatedQAEvent(config,{runId},{debug:true,fetchImpl:async()=>({ok:true,status:200,json:async()=>({validationMessages:[]})})});
 assert.equal(r.state,'debug_transport_accepted');assert.equal(r.processed,false);
});
test('reconciliation refuses to confirm reports without trusted QA data source',()=>{
 const input={runId,expectedCount:3,observedCount:3,qaMeasurementId:config.qaMeasurementId,propertyMeasurementId:config.qaMeasurementId};
 assert.equal(reconcileQAObservations({...input,observationSource:'browser_guess'}).state,'unverified');
 assert.equal(reconcileQAObservations({...input,observationSource:'authenticated_qa_reporting_api'}).state,'verified');
 assert.equal(reconcileQAObservations({...input,observationSource:'authenticated_qa_reporting_api',observedCount:2}).state,'partial');
});
