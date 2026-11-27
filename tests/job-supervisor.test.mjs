import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {jobTimeoutMs,superviseChild,terminateChild} from '../src/job-supervisor.mjs';

const script=(code)=>spawn(process.execPath,['-e',code],{
 detached:process.platform!=='win32',stdio:'ignore'});

test('job deadlines are finite, bounded and account for pacing and page counts',()=>{
 const base={sessions:1,maxPages:1,intervalSeconds:8,dwellSeconds:8};
 const a=jobTimeoutMs(base);
 assert.ok(a>=60000&&a<300000);
 assert.ok(jobTimeoutMs({...base,sessions:5})>a);
 assert.ok(jobTimeoutMs({...base,sessions:5,maxPages:4})>jobTimeoutMs({...base,sessions:5}));
 assert.ok(jobTimeoutMs({...base,sessions:25,maxPages:4,intervalSeconds:120,dwellSeconds:60})<=7_200_000);
 const explicit={...base,requestedJourney:[{action:'navigate',path:'/'},{action:'dwell',seconds:30},{action:'dwell',seconds:30},{action:'assert',selector:'h1'}]};
 assert.ok(jobTimeoutMs(explicit)>jobTimeoutMs(base),'explicit long dwell must not be killed using legacy dwell budget');
 for(const bad of [{...base,sessions:0},{...base,maxPages:9},{...base,dwellSeconds:Infinity},{...base,intervalSeconds:200}])
  assert.throws(()=>jobTimeoutMs(bad),/Invalid bounded browser plan/);
});

test('successful subprocess is released without false cancellation',async()=>{
 const child=script('process.exit(0)');
 const ctrl=superviseChild(child,{timeoutMs:3000,processGroup:process.platform!=='win32'});
 const result=await ctrl.done;
 assert.equal(result.exitCode,0);
 assert.equal(result.stopReason,null);
 assert.equal(ctrl.stop('cancelled'),false);
});

test('watchdog terminates stuck subprocess and records timeout',async()=>{
 const child=script('setInterval(()=>{},1000)');
 const ctrl=superviseChild(child,{timeoutMs:80,graceMs:80,processGroup:process.platform!=='win32'});
 const result=await Promise.race([ctrl.done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('watchdog hung')),3500))]);
 assert.equal(result.stopReason,'timeout');
 assert.notEqual(result.exitCode,0);
});

test('manual cancel stops a waiting subprocess only once',async()=>{
 const child=script('setInterval(()=>{},1000)');
 const ctrl=superviseChild(child,{timeoutMs:3000,graceMs:80,processGroup:process.platform!=='win32'});
 assert.equal(ctrl.stop('cancelled'),true);
 assert.equal(ctrl.stop('shutdown'),false);
 const outcome=await ctrl.done;
 assert.equal(outcome.stopReason,'cancelled');
 assert.notEqual(outcome.exitCode,0);
});

test('shutdown stops subprocess cleanly',async()=>{
 const child=script('setInterval(()=>{},1000)');
 const ctrl=superviseChild(child,{timeoutMs:3000,graceMs:80,processGroup:process.platform!=='win32'});
 assert.equal(ctrl.stop('shutdown'),true);
 assert.equal((await ctrl.done).stopReason,'shutdown');
 assert.equal(terminateChild(child,'SIGTERM',{processGroup:process.platform!=='win32'}),false);
});

test('SIGKILL escalates if child ignores graceful shutdown',async()=>{
 const child=script("process.on('SIGTERM',()=>{});process.stdout?.write?.('ready');setInterval(()=>{},1000)");
 // Give Node time to install its SIGTERM handler before signalling.
 await new Promise(r=>setTimeout(r,140));
 const ctrl=superviseChild(child,{timeoutMs:3000,graceMs:65,processGroup:process.platform!=='win32'});
 assert.equal(ctrl.stop('shutdown'),true);
 const result=await Promise.race([ctrl.done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('SIGKILL escalation failed')),3500))]);
 assert.equal(result.stopReason,'shutdown');
 assert.notEqual(result.exitCode,0);
});
