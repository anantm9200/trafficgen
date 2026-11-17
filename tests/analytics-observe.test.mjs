import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAnalyticsRequest,summarizeAnalyticsRequests} from '../src/analytics-observe.mjs';
test('recognizes GA4 browser collection without exposing identifiers',()=>{
 const x=classifyAnalyticsRequest('https://www.google-analytics.com/g/collect?v=2&tid=G-TEST123&cid=private&id=secret&en=page_view');
 assert.deepEqual(x,{provider:'ga4',kind:'collection_request',event:'page_view'});
 assert.equal(JSON.stringify(x).includes('private'),false);
});
test('recognizes Vercel web analytics',()=>{
 assert.equal(classifyAnalyticsRequest('https://vitals.vercel-insights.com/v1/view').provider,'vercel');
 assert.equal(classifyAnalyticsRequest('https://vitals.vercel-insights.com/v1/event').kind,'event');
});
test('rejects unrelated and spoofed domains',()=>{
 assert.equal(classifyAnalyticsRequest('https://google-analytics.com.evil.example/g/collect'),null);
 assert.equal(classifyAnalyticsRequest('https://example.com/collect'),null);
});
test('aggregates events',()=>{
 const events=[classifyAnalyticsRequest('https://www.google-analytics.com/g/collect?en=page_view'),classifyAnalyticsRequest('https://vitals.vercel-insights.com/v1/view')];
 assert.equal(summarizeAnalyticsRequests(events).observed,2);
});
