import test from 'node:test';import assert from 'node:assert/strict';
import {resourceAdmission,sampleResourceAdmission} from '../src/resource-budget.mjs';
const GB=1024**3;
const baseline={freeMemoryBytes:20*GB,totalMemoryBytes:100*GB,load1:2,cpuCount:16,
 requestedConcurrency:2,maxConcurrency:2};
test('admits bounded parallel QA when headroom is available',()=>{
 const r=resourceAdmission(baseline);
 assert.equal(r.allowed,true);assert.equal(r.concurrency,2);assert.equal(r.reason,'normal');
});
test('never expands concurrency beyond explicit worker cap',()=>{
 const r=resourceAdmission({...baseline,maxConcurrency:1});
 assert.equal(r.concurrency,1);
});
test('reduces concurrency when machine load is high',()=>{
 const r=resourceAdmission({...baseline,load1:18});
 assert.equal(r.concurrency,1);assert.equal(r.reason,'high_cpu_load');
});
test('prevents starting new browser runs with dangerously low free memory',()=>{
 const r=resourceAdmission({...baseline,freeMemoryBytes:512*1024**2});
 assert.equal(r.allowed,false);assert.equal(r.concurrency,0);assert.equal(r.reason,'low_available_memory');
});
test('rejects malformed readings and invalid requested concurrency',()=>{
 assert.throws(()=>resourceAdmission({...baseline,requestedConcurrency:0}));
 assert.throws(()=>resourceAdmission({...baseline,load1:NaN}));
 assert.throws(()=>resourceAdmission({...baseline,cpuCount:0}));
});
test('local host resource sampling gives a finite advisory result',()=>{
 const r=sampleResourceAdmission();
 assert.ok(Number.isFinite(r.loadPerCore));
 assert.ok(r.reason);
});
