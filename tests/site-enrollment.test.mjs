import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySiteAndDetect } from '../api/site-verify.js';
import { checkTxtStatus } from '../api/dns-status.js';
import { error } from '../src/plan.mjs';

const plan={targetUrl:'https://www.example.org/',verificationToken:'tg_1234567890abcdefgh',authorized:true};
const verified={verified:true,method:'dns_txt',hostname:'www.example.org',checkedAt:'2026-11-17T12:00:00.000Z'};

test('TXT-based website enrollment works without API credentials and detects GA4',async()=>{
 let fetchCount=0,verifiedCount=0;
 const result=await verifySiteAndDetect(plan,{
  throttle:()=>{},
  verifyDns:async (url,token)=>{verifiedCount++;assert.equal(url,plan.targetUrl);assert.equal(token,plan.verificationToken);return verified;},
  dnsCheck:async()=>['8.8.8.8'],
  fetchPage:async(target,ip)=>{fetchCount++;assert.equal(ip,'8.8.8.8');return{
   status:200,headers:{'content-type':'text/html'},body:'<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345"></script>'};}
 });
 assert.equal(result.ok,true);
 assert.equal(result.verification.verified,true);
 assert.deepEqual(result.ga4.measurementIds,['G-TEST12345']);
 assert.equal(fetchCount,1);assert.equal(verifiedCount,1);
 assert.match(result.note,/API authentication/);
});

test('Invalid or absent DNS proof cannot trigger a page fetch',async()=>{
 let called=false;
 await assert.rejects(()=>verifySiteAndDetect(plan,{
  throttle:()=>{},
  verifyDns:async()=>{throw error('DNS TXT token mismatch',403);},
  fetchPage:async()=>{called=true;return{};}
 }),/mismatch/);
 assert.equal(called,false);
});
test('GA4 fetch failure preserves successfully verified domain status',async()=>{
 const r=await verifySiteAndDetect(plan,{
  throttle:()=>{},verifyDns:async()=>verified,dnsCheck:async()=>['8.8.8.8'],
  fetchPage:async()=>{throw new Error('HTTPS blocked by site');}
 });
 assert.equal(r.verification.verified,true);
 assert.equal(r.ga4.status,'inspection_unavailable');
 assert.match(r.ga4.note,/HTTPS blocked/);
});
test('Public DNS check reports presence without revealing TXT tokens',async()=>{
 const result=await checkTxtStatus('www.example.org',{lookup:async()=>[
  ['visitorlab-verification=tg_1234567890abcdefgh'],['unrelated=hello']
 ]});
 assert.equal(result.recordPresent,true);
 assert.equal(result.verificationRecordCount,1);
 assert.equal(result.recordName,'_visitorlab.www.example.org');
 assert.ok(!JSON.stringify(result).includes('tg_123'));
});
test('Read-only DNS diagnostics distinguish missing records from missing marker',async()=>{
 const absent=await checkTxtStatus('www.example.org',{lookup:async()=>{const e=new Error('missing');e.code='ENOTFOUND';throw e;}});
 assert.equal(absent.recordPresent,false);
 assert.equal(absent.status,'not_published');
 const other=await checkTxtStatus('www.example.org',{lookup:async()=>[['v=spf1 -all']]});
 assert.equal(other.recordPresent,false);
 assert.equal(other.status,'no_visitorlab_record');
});
test('Refuses non-public or malformed domains',async()=>{
 await assert.rejects(()=>checkTxtStatus('localhost',{lookup:async()=>[]}),/HTTPS/);
 await assert.rejects(()=>checkTxtStatus('10.0.0.1',{lookup:async()=>[]}),/HTTPS/);
 await assert.rejects(()=>checkTxtStatus('https://www.example.org/path',{lookup:async()=>[]}),/HTTPS|Invalid/);
});
