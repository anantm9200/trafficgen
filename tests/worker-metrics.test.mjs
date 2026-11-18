import test from 'node:test';
import assert from 'node:assert/strict';
import {percentile,summarizeDurations,queueMetrics} from '../src/worker-metrics.mjs';

test('percentiles handle empty, invalid and unsorted inputs',()=>{
 assert.equal(percentile([],95),null);
 assert.equal(percentile([NaN,-1],50),null);
 assert.equal(percentile([80,10,40,20],50),20);
 assert.equal(percentile([80,10,40,20],95),80);
 assert.deepEqual(summarizeDurations([0,10,20,NaN]),{count:3,p50Ms:10,p95Ms:20,maxMs:20});
});
test('queue health separates queued, running and finished timing',()=>{
 const rows=[
  {status:'queued',created_at:'2026-11-18T00:00:01.000Z',started_at:null,finished_at:null},
  {status:'completed',created_at:'2026-11-18T00:00:00.000Z',started_at:'2026-11-18T00:00:02.000Z',finished_at:'2026-11-18T00:00:05.000Z'},
  {status:'failed',created_at:'2026-11-18T00:00:03.000Z',started_at:'2026-11-18T00:00:04.000Z',finished_at:'2026-11-18T00:00:06.000Z'}
 ];
 const m=queueMetrics(rows,Date.parse('2026-11-18T00:00:10.000Z'));
 assert.equal(m.counts.queued,1);
 assert.equal(m.counts.completed,1);
 assert.equal(m.counts.failed,1);
 assert.equal(m.oldestQueuedMs,9000);
 assert.deepEqual(m.queueWait,{count:2,p50Ms:1000,p95Ms:2000,maxMs:2000});
 assert.deepEqual(m.runTime,{count:2,p50Ms:2000,p95Ms:3000,maxMs:3000});
});
