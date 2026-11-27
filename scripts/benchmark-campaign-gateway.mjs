// Self-contained loopback-only benchmark. No website visits, browser launches or GA4 events.
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {createCampaignApi} from '../src/campaign-api.mjs';
import {CampaignStore} from '../src/campaign-store.mjs';
import {relayCampaignToLoopback} from '../src/campaign-loopback.mjs';
import {summarizeDurations} from '../src/worker-metrics.mjs';
const token='local_benchmark_service_token_42_chars_minimum';
const store=new CampaignStore();
const api=createCampaignApi({store,apiKey:token,verifySite:async()=>({verified:true}),dispatchWorker:async()=>({ok:true,job:{id:'benchmark-only'}})});
api.server.listen(0,'127.0.0.1');await once(api.server,'listening');
const port=api.server.address().port;
const samples=[];
try{
 for(let n=0;n<45;n++){
  const before=performance.now();
  const r=await relayCampaignToLoopback('campaigns',{port,token});
  const elapsed=performance.now()-before;
  if(r.status!==200)throw Error('Unexpected benchmark response: '+r.status);
  if(n>=5)samples.push(elapsed);
 }
 const result={name:'TrafficGen local loopback Campaign API relay',source:'local process only',warmup:5,samples:samples.length,
  ...summarizeDurations(samples),note:'Local loopback latency only; excludes Vercel, Cloudflare, DGX browser startup, site navigation and GA4.'};
 console.log(JSON.stringify(result,null,2));
}finally{await new Promise(r=>api.server.close(r));store.close()}
