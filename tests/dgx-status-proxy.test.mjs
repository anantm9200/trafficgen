import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDgxHealth} from '../src/dgx-client.mjs';

test('authenticated DGX status passes through measured queue timing without inventing metrics',async()=>{
 const seen=[];
 const metrics={counts:{queued:1,running:0,completed:3,failed:1,cancelled:0},queueWait:{count:4,p50Ms:130,p95Ms:550,maxMs:550},
  runTime:{count:4,p50Ms:9500,p95Ms:16000,maxMs:16000},oldestQueuedMs:900};
 const env={DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com',CF_ACCESS_CLIENT_ID:'id',CF_ACCESS_CLIENT_SECRET:'secret'};
 const status=await checkDgxHealth({env,fetchImpl:async(url,init)=>{seen.push({url,init});return new Response(JSON.stringify({ok:true,
  service:'trafficgen-dgx-worker',mode:'job-queue',uptimeSeconds:100,activeJob:null,metrics}),{status:200,headers:{'content-type':'application/json'}})}});
 assert.deepEqual(status.metrics,metrics);
 assert.equal(status.service,'trafficgen-dgx-worker');
 assert.equal(seen.length,1);
 assert.equal(seen[0].url,'https://trafficgen-dgx-spark.iagatlas.com/health');
 assert.equal(seen[0].init.headers['CF-Access-Client-Id'],'id');
});
test('unconfigured or untrusted DGX endpoint cannot be used for health checks',async()=>{
 await assert.rejects(()=>checkDgxHealth({env:{DGX_API_URL:'https://another.example.org/',CF_ACCESS_CLIENT_ID:'x',CF_ACCESS_CLIENT_SECRET:'y'}}),/approved hostname/);
 await assert.rejects(()=>checkDgxHealth({env:{DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com'}}),/not configured/);
});
