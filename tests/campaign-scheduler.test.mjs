import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule,nextDispatchAt,canDispatch} from '../src/campaign-scheduler.mjs';
const scheduled={sessions:3,intervalSeconds:8,concurrency:1,maxSessionsPerDay:10};
test('accepts bounded synthetic QA schedule',()=>assert.equal(validateSchedule(scheduled).sessions,3));
test('rejects excessive concurrency and daily budget',()=>{
 assert.throws(()=>validateSchedule({...scheduled,concurrency:100}));
 assert.throws(()=>validateSchedule({...scheduled,maxSessionsPerDay:1000}));
});
test('respects pacing',()=>assert.equal(nextDispatchAt({lastDispatchAt:1000,now:2000,intervalSeconds:8}),9000));
test('blocks active capacity',()=>assert.equal(canDispatch({active:1,dispatchedToday:0,scheduled,now:10000,lastDispatchAt:0}).reason,'concurrency_limit'));
test('blocks exhausted budget',()=>assert.equal(canDispatch({active:0,dispatchedToday:10,scheduled,now:10000,lastDispatchAt:0}).reason,'daily_budget'));
test('permits a bounded dispatch',()=>assert.equal(canDispatch({active:0,dispatchedToday:2,scheduled,now:10000,lastDispatchAt:0}).allowed,true));
