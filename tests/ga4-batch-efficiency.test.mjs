import test from 'node:test';
import assert from 'node:assert/strict';
import {createQABatchEvent,sendIsolatedQABatch} from '../src/qa-analytics.mjs';
const runId='b7083d04-20a9-4830-abcf-72868d88a510';
const cfg={qaMeasurementId:'G-QATEST12345',productionMeasurementId:'G-PROD123456',qaApiSecret:'private-qa-key'};
test('generates at most 25 explicitly synthetic GA4 events in one bounded batch',()=>{
 const event=createQABatchEvent({runId,count:25,clientId:'qa-client-id-12345'});
 assert.equal(event.events.length,25);
 assert.deepEqual(event.events.map(e=>e.params.tg_session_number),Array.from({length:25},(_,i)=>i+1));
 assert.ok(event.events.every(e=>e.params.tg_run_id===runId&&e.params.tg_synthetic===1&&e.params.tg_qa_only===1));
 for(const invalid of [0,26,-1,1.5])assert.throws(()=>createQABatchEvent({runId,count:invalid}),/1–25/);
});
test('sends exactly one request for all QA event identifiers to designated QA stream',async()=>{
 let requests=0;
 const result=await sendIsolatedQABatch(cfg,{runId,count:25},{fetchImpl:async(url,opts)=>{
  requests++;const target=new URL(url);assert.equal(target.searchParams.get('measurement_id'),cfg.qaMeasurementId);
  assert.equal(opts.method,'POST');assert.equal(JSON.parse(opts.body).events.length,25);
  return new Response(null,{status:204});
 }});
 assert.equal(requests,1);assert.equal(result.acceptedCount,25);
 assert.equal(result.reportVisible,false);assert.equal(result.processed,false);
});
test('timeout leaves transport unconfirmed, without automatic retry',async()=>{
 let requests=0;
 const result=await sendIsolatedQABatch(cfg,{runId,count:2},{fetchImpl:async()=>{requests++;throw Error('network')}});
 assert.equal(requests,1);assert.equal(result.state,'transport_unconfirmed');assert.equal(result.acceptedCount,0);
});
