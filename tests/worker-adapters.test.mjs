import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDgxAdapter,makeSiteCredentialsResolver,makeDnsOwnershipAdapter} from '../src/worker-adapters.mjs';
const base='https://trafficgen-dgx-spark.iagatlas.com';
const creds={DGX_API_URL:base,TG_DGX_JOB_TOKEN:'0123456789abcdef0123456789abcdef',CF_ACCESS_CLIENT_ID:'id',CF_ACCESS_CLIENT_SECRET:'secret'};
test('DGX dispatch pins approved URL and bearer auth; no redirects',async()=>{
 const attempts=[];
 const adapter=makeDgxAdapter({env:creds,fetchImpl:async(url,options)=>{
  attempts.push({url,options});
  return new Response(JSON.stringify({ok:true,job:{id:'job-123'}}),{status:202,headers:{'content-type':'application/json'}})
 }});
 const result=await adapter.dispatchWorker({analytics:{enabled:false},synthetic:true});
 assert.equal(result.job.id,'job-123');assert.equal(attempts[0].url,base+'/jobs');
 assert.equal(attempts[0].options.redirect,'manual');
 assert.equal(attempts[0].options.headers['CF-Access-Client-Id'],'id');
});
test('DGX worker failure does not produce a fabricated accepted job',async()=>{
 const adapter=makeDgxAdapter({env:creds,fetchImpl:async()=>new Response('bad gateway',{status:502})});
 await assert.rejects(()=>adapter.dispatchWorker({}),/rejected/);
});
test('Scheduled site proofs resolve only exact approved hostnames',()=>{
 const resolver=makeSiteCredentialsResolver({TG_SITE_PROOFS_JSON:JSON.stringify({'example.org':'tg_12345678901234567890'})});
 assert.ok(resolver('https://example.org').verificationToken);
 assert.equal(resolver('https://evil-example.org'),null);
});
test('Verification rejects an absent or incorrect TXT proof',async()=>{
 const proof=makeDnsOwnershipAdapter({lookupFn:async()=>[{address:'8.8.8.8',family:4}],resolveTxtFn:async()=>[['wrong']]});
 await assert.rejects(()=>proof('https://example.org','tg_12345678901234567890'),/does not match/);
});
