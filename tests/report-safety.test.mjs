import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReportUrl,safeReportMessage} from '../src/report-safety.mjs';
test('report URLs cannot retain sensitive query, fragment or basic-auth credentials',()=>{
 const x=safeReportUrl('https://user:pass@owned.example.org/private/receipt?api_secret=HIDDEN&email=person%40example.org#fragment');
 assert.equal(x,'https://owned.example.org/private/receipt');
 for(const secret of ['user','pass','HIDDEN','person','fragment'])assert.equal(x.includes(secret),false);
});
test('report messages redact embedded URLs and authorization headers',()=>{
 const message='Failed https://owned.example.org/quote?secret=VERYSECRET Authorization: Bearer topsecret123';
 const s=safeReportMessage(message);
 assert.match(s,/https:\/\/owned.example.org\/quote/);
 assert.ok(!s.includes('VERYSECRET'));
 assert.ok(!s.includes('topsecret123'));
});
test('non HTTP destinations are not logged as navigational evidence',()=>{
 assert.equal(safeReportUrl('data:text/html,hello'),'[redacted-url]');
 assert.equal(safeReportUrl('not-a-url'),'[invalid-url]');
});
test('stored errors are bounded to a predictable size',()=>{
 const s=safeReportMessage('a'.repeat(1200),120);
 assert.equal(s.length,120);
});
