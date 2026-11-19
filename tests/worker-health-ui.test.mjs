import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CampaignStore} from '../src/campaign-store.mjs';
import {createCampaignApi} from '../src/campaign-api.mjs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('campaign dashboard exposes measured queue timing rather than fabricated traffic',()=>{
 assert.match(html,/id="worker-queue-health"/);
 assert.match(js,/api\/worker-health/);
 assert.match(js,/queueWait\?\.p95Ms/);
 assert.match(js,/runTime\?\.p95Ms/);
});
test('worker health endpoint authenticates, verifies worker identity and returns observed metrics',async()=>{
 const db=new CampaignStore();const key='health_metric_auth_key_at_least_24_chars';
 const metric={counts:{queued:1,running:0,completed:2,failed:0,cancelled:0},queueWait:{p95Ms:250},runTime:{p95Ms:4500}};
 const api=createCampaignApi({store:db,apiKey:key,verifySite:async()=>({verified:true}),dispatchWorker:async()=>({ok:true,job:{id:'fixture-id'}}),healthWorker:async()=>({ok:true,service:'trafficgen-dgx-worker',mode:'job-queue',uptimeSeconds:60,activeJob:null,metrics:metric})});
 api.server.listen(0,'127.0.0.1');await new Promise(r=>api.server.once('listening',r));
 try{const url='http://127.0.0.1:'+api.server.address().port+'/api/worker-health';
  assert.equal((await fetch(url)).status,401);
  const r=await fetch(url,{headers:{Authorization:'Bearer '+key}});
  assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.worker.metrics,metric);
  assert.equal(data.worker.activeJob,null);
 }finally{await new Promise(r=>api.server.close(r));db.close()}
});
