import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {verifyIsolatedQAStream} from '../src/ga4-stream-proof.mjs';
const pem=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});
const cfg={qaPropertyId:'123456789',serviceAccountEmail:'trafficgen@fixture-123.iam.gserviceaccount.com',privateKeyPem:pem};
function mock(streams){return async url=>url==='https://oauth2.googleapis.com/token'
 ?new Response(JSON.stringify({access_token:'z'.repeat(35)}),{status:200})
 :new Response(JSON.stringify({dataStreams:streams}),{status:200});}
test('Admin API confirms QA stream belongs to configured isolated property',async()=>{
 const r=await verifyIsolatedQAStream(cfg,{qaMeasurementId:'G-QATEST12345',fetchImpl:mock([
  {name:'properties/123456789/dataStreams/333',type:'WEB_DATA_STREAM',webStreamData:{measurementId:'G-QATEST12345'}}
 ])});
 assert.deepEqual(r,{verified:true,source:'analytics_admin_api',propertyId:'123456789',measurementId:'G-QATEST12345'});
});
test('rejects measurement stream from another property even when the ID matches',async()=>{
 await assert.rejects(()=>verifyIsolatedQAStream(cfg,{qaMeasurementId:'G-QATEST12345',fetchImpl:mock([
  {name:'properties/987654321/dataStreams/333',type:'WEB_DATA_STREAM',webStreamData:{measurementId:'G-QATEST12345'}}
 ])}),/property identity mismatch/);
});
test('refuses distinct but unauthorized production stream ID',async()=>{
 await assert.rejects(()=>verifyIsolatedQAStream(cfg,{qaMeasurementId:'G-PROD123456',fetchImpl:mock([
  {name:'properties/123456789/dataStreams/333',type:'WEB_DATA_STREAM',webStreamData:{measurementId:'G-QATEST12345'}}
 ])}),/does not belong/);
});
test('refuses missing service credentials without contacting Google',async()=>{
 await assert.rejects(()=>verifyIsolatedQAStream({qaPropertyId:'123456789'},{qaMeasurementId:'G-QATEST12345',fetchImpl:async()=>{throw Error('not called')}}),/service account/);
});
