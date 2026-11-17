import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDgxHealth} from '../src/dgx-client.mjs';
const env={DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com',CF_ACCESS_CLIENT_ID:'test-id',CF_ACCESS_CLIENT_SECRET:'test-secret'};
test('health request uses exact approved host and Access headers',async()=>{
 const got=await checkDgxHealth({env,fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://trafficgen-dgx-spark.iagatlas.com/health');
  assert.equal(opts.headers['CF-Access-Client-Id'],'test-id');
  assert.equal(opts.redirect,'manual');
  return new Response(JSON.stringify({ok:true,service:'trafficgen-dgx-worker',mode:'health-only',uptimeSeconds:3}),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(got.mode,'health-only');
 assert.equal(JSON.stringify(got).includes('secret'),false);
});
test('rejects arbitrary destinations and redirects',async()=>{
 await assert.rejects(checkDgxHealth({env:{...env,DGX_API_URL:'https://evil.example'}}),/approved hostname/);
 await assert.rejects(checkDgxHealth({env,fetchImpl:async()=>new Response('',{status:302})}),/rejected/);
});
test('fails closed without credentials',async()=>{
 await assert.rejects(checkDgxHealth({env:{DGX_API_URL:env.DGX_API_URL}}),/authentication/);
});
