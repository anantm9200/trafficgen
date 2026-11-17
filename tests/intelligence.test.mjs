import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,analyzeWithDGX} from '../src/intelligence.mjs';

const report={
 plan:{runId:'abc',browser:'chromium',countries:['AE'],devices:['iphone']},
 summary:{completed:2,passed:1,failed:1,brokenImages:2,javaScriptErrors:1,stoppedEarly:true,timingsMs:{p50:900,p95:4700}},
 sessions:[{index:1,device:'iphone',countryCode:'AE',ok:false,status:503,durationMs:4100,
 pages:[{status:503,durationMs:4700}],jsErrors:['Network error'],error:'HTTP 503'}]
};
test('deterministic reporting finds failures and device distribution',()=>{
 const s=summarize(report);
 assert.equal(s.engine,'deterministic');
 assert.equal(s.byDevice.iphone.failures,1);
 assert.ok(s.findings.some(f=>f.code==='STOPPED_EARLY'));
 assert.ok(s.findings.some(f=>f.code==='SLOW_NAVIGATION'));
});
test('without DGX secrets, useful deterministic reporting continues',async()=>{
 const s=await analyzeWithDGX(report,{endpoint:'',apiKey:'',model:''});
 assert.equal(s.dgx.used,false);
 assert.ok(s.findings.length>1);
});
test('private DGX mock returns advisory report, not executable instructions',async()=>{
 let called=false;let body;
 const s=await analyzeWithDGX(report,{
  endpoint:'https://private-gateway.example/v1/chat/completions',
  model:'test-model',apiKey:'only-used-in-transport',
  fetchImpl:async(url,options)=>{called=true;body=JSON.parse(options.body);
   assert.equal(options.headers.Authorization,'Bearer only-used-in-transport');
   assert.equal(new URL(url).pathname,'/v1/chat/completions');
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:'Detected 503 failures',nextTests:['Retest after fixing 503'],confidence:'medium'})}}]})};
  }});
 assert.equal(called,true);
 assert.equal(s.dgx.used,true);
 assert.equal(s.dgx.confidence,'medium');
 assert.ok(!JSON.stringify(body).includes('verificationToken'));
});
test('rejects insecure DGX gateway URLs',async()=>{
 const s=await analyzeWithDGX(report,{endpoint:'http://127.0.0.1:8001/v1/chat/completions',apiKey:'fake',model:'fake'});
 assert.equal(s.dgx.used,false);
 assert.match(s.dgx.reason,/HTTPS/);
});
