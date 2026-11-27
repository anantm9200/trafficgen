import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {buildServiceAccountAssertion,buildQAReportQuery,fetchGA4QAObservations} from '../src/ga4-reporting.mjs';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const PEM=privateKey.export({type:'pkcs8',format:'pem'});
const cfg={qaPropertyId:'123456789',serviceAccountEmail:'trafficgen@project-123.iam.gserviceaccount.com',privateKeyPem:PEM};
const runId='ca2f1cb3-4752-4b7e-8c45-0aff1e6f31e1';
test('OAuth service assertion is correctly signed and scoped to read-only GA4 data',()=>{
 const assertion=buildServiceAccountAssertion(cfg,{nowSeconds:1795000000});const [head,body,sig]=assertion.split('.');
 const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
 assert.equal(payload.scope,'https://www.googleapis.com/auth/analytics.readonly');
 assert.equal(payload.exp-payload.iat,3300);
 assert.ok(verify('RSA-SHA256',Buffer.from(head+'.'+body),privateKey,Buffer.from(sig,'base64url')));
});
test('Data API queries the separate QA property and exact run ID custom dimension',async()=>{
 const urls=[];const fetchImpl=async(url,options)=>{
  urls.push(url);
  if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'a'.repeat(24)}),{status:200});
  assert.equal(options.headers.authorization,'Bearer '+'a'.repeat(24));
  const query=JSON.parse(options.body);
  assert.equal(query.dimensions[1].name,'customEvent:tg_run_id');
  assert.equal(query.dimensionFilter.andGroup.expressions[1].filter.stringFilter.value,runId);
  return new Response(JSON.stringify({rows:[{dimensionValues:[{value:'trafficgen_qa_session'},{value:runId}],metricValues:[{value:'3'}]}]}),{status:200});
 };
 const result=await fetchGA4QAObservations(cfg,{runId,fetchImpl});
 assert.equal(result.observedCount,3);
 assert.equal(result.source,'authenticated_qa_reporting_api');
 assert.equal(urls[1],'https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport');
});
test('Missing custom dimension rows reports zero, never invents analytics receipt',async()=>{
 let step=0;
 const fetchImpl=async()=>{
  step++;return new Response(JSON.stringify(step===1?{access_token:'a'.repeat(24)}:{rows:[]}),{status:200});
 };
 assert.equal((await fetchGA4QAObservations(cfg,{runId,fetchImpl})).observedCount,0);
});
test('GA4 query rejects malformed run IDs and property config',()=>{
 assert.throws(()=>buildQAReportQuery('../../evil'),/Invalid/);
 assert.throws(()=>buildServiceAccountAssertion({...cfg,qaPropertyId:'evil'}),/property ID/);
});
