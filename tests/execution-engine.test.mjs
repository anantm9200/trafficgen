import test from 'node:test';
import assert from 'node:assert/strict';
import {runPacedSessions,withBrowser,withCleanContext,delay,summarizeMs,assertExecutionBudget} from '../src/execution-engine.mjs';
const options={sessions:3,concurrency:1,intervalMs:0};
test('restricts sessions and concurrency to bounded QA budgets',()=>{
 assert.equal(assertExecutionBudget(options),1);
 for(const bad of [{sessions:100,concurrency:1,intervalMs:0},{sessions:1,concurrency:9,intervalMs:0},{sessions:1,concurrency:1,intervalMs:-1}])
  assert.throws(()=>assertExecutionBudget(bad));
});
test('runs all sessions and preserves submission order',async()=>{
 const result=await runPacedSessions({...options,run:async i=>({index:i,ok:true})});
 assert.deepEqual(result.results.map(x=>x.index),[0,1,2]);
 assert.equal(result.metrics.finished,3);
 assert.equal(result.metrics.peakActive,1);
});
test('caps active sessions even when tasks take different durations',async()=>{
 let concurrent=0,highest=0;
 const r=await runPacedSessions({sessions:12,concurrency:2,intervalMs:0,
  run:async i=>{highest=Math.max(highest,++concurrent);await delay(i%2?6:2);concurrent--;return {ok:true}}});
 assert.equal(highest,2);
 assert.equal(r.metrics.peakActive,2);
 assert.equal(r.metrics.skipped,0);
});
test('pacing is serial and measures spacing using a monotonic clock',async()=>{
 let now=0;
 const result=await runPacedSessions({sessions:3,concurrency:1,intervalMs:100,
  clock:()=>now,sleep:async ms=>{now+=ms},run:async()=>({ok:true})});
 assert.deepEqual(result.metrics.startSpacingMs,{count:2,p50Ms:100,p95Ms:100,maxMs:100});
 assert.equal(result.metrics.wallMs,200);
});
test('aborted before start schedules no browser work',async()=>{
 const ac=new AbortController();ac.abort();
 const r=await runPacedSessions({...options,signal:ac.signal,run:async()=>{throw Error('should not run')}});
 assert.equal(r.metrics.started,0);
 assert.equal(r.metrics.skipped,3);
 assert.equal(r.metrics.stoppedEarly,true);
});
test('external stop prevents dispatch after the first failed page',async()=>{
 let denied=false;
 const r=await runPacedSessions({...options,shouldStop:()=>denied,run:async i=>{denied=true;return {index:i,ok:false}}});
 assert.equal(r.metrics.started,1);
 assert.equal(r.metrics.skipped,2);
 assert.equal(r.metrics.stoppedEarly,true);
});
test('session error is contained without retrying or losing later jobs',async()=>{
 const r=await runPacedSessions({...options,run:async i=>{if(i===1)throw Error('fixture error');return {ok:true}}});
 assert.equal(r.results[1].ok,false);
 assert.equal(r.results[1].error,'fixture error');
 assert.equal(r.metrics.errors.length,1);
 assert.equal(r.metrics.finished,3);
});
test('browser launched once and closed on success',async()=>{
 let opened=0,closed=0;
 const r=await withBrowser({launch:async()=>{opened++;return {close:async()=>closed++}},execute:async()=>42});
 assert.equal(r.value,42);assert.equal(opened,1);assert.equal(closed,1);
});
test('browser closes if execution throws',async()=>{
 let closed=false;
 await assert.rejects(withBrowser({launch:async()=>({close:async()=>{closed=true}}),execute:async()=>{throw Error('failed')}}));
 assert.equal(closed,true);
});
test('each browser session gets an isolated, closed context even after failure',async()=>{
 let created=0,closed=0;
 const fake={newContext:async()=>({id:++created,close:async()=>{closed++}})};
 assert.equal(await withCleanContext(fake,{locale:'en-AE'},async ctx=>ctx.id),1);
 await assert.rejects(withCleanContext(fake,{locale:'en-US'},async()=>{throw Error('fail')}));
 assert.equal(created,2);assert.equal(closed,2);
});
test('timings handle no observations and exclude invalid values',()=>{
 assert.deepEqual(summarizeMs([]),{count:0,p50Ms:null,p95Ms:null,maxMs:null});
 assert.deepEqual(summarizeMs([3,1,2,NaN,-1]),{count:3,p50Ms:2,p95Ms:3,maxMs:3});
});
