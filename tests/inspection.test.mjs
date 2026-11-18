import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectHtml, inspectVerifiedPage } from '../src/inspection.mjs';
import { normalizePlan } from '../src/plan.mjs';

const plan=normalizePlan({
 targetUrl:'https://www.example.org/',authorized:true,verificationToken:'tg_1234567890abcdefgh',
 sessions:1,concurrency:1,countries:['US'],devices:['desktop']
});
const fixture='<html lang="en"><head><title>Example &amp; Co</title>'+
 '<meta name="description" content="Useful demo description">'+
 '<meta name="viewport" content="width=device-width">'+
 '<link rel="canonical" href="https://www.example.org/">'+
 '</head><body><h1>Example</h1><img src="/logo.svg" alt="Example logo"><a href="/about">About</a></body></html>';

test('Parses HTML metadata and security observations without inventing search traffic',()=>{
 const a=inspectHtml(fixture,200,{'content-type':'text/html','strict-transport-security':'max-age=31536000'});
 assert.equal(a.observations.title,'Example & Co');
 assert.equal(a.observations.metaDescription,'Useful demo description');
 assert.equal(a.observations.h1Count,1);
 assert.equal(a.observations.imagesWithoutAlt,0);
 assert.equal(a.observations.headers.hsts,true);
 assert.equal(a.findings.some(x=>x.level==='high'),false);
});
test('Reports genuine technical findings',()=>{
 const a=inspectHtml('<html><body><img src="a.jpg"><h1>A</h1><h1>B</h1></body></html>',404,{'content-type':'text/html'});
 const codes=a.findings.map(x=>x.code);
 for(const code of ['HTTP_STATUS','MISSING_TITLE','MISSING_META_DESCRIPTION','MISSING_VIEWPORT','MULTIPLE_H1','MISSING_IMAGE_ALT'])
  assert.ok(codes.includes(code),code);
});
test('Cannot inspect without site ownership proof or public destination',async()=>{
 await assert.rejects(()=>inspectVerifiedPage(plan,{verify:async()=>({verified:false,hostname:'www.example.org'})}),/not verified/);
 await assert.rejects(()=>inspectVerifiedPage(plan,{verify:async()=>({verified:true,hostname:'www.example.org'}),dnsCheck:async()=>['127.0.0.1']}),/public address/);
 const bad={...plan,targetUrl:'https://www.example.org/checkout'};
 await assert.rejects(()=>inspectVerifiedPage(bad,{verify:async()=>({verified:true,hostname:'www.example.org'})}),/Unsafe/);
});
test('Inspect a verified site once and return real measured response',async()=>{
 let calls=0;
 const output=await inspectVerifiedPage(plan,{
  verify:async()=>({verified:true,hostname:'www.example.org'}),
  dnsCheck:async()=>['8.8.8.8'],
  fetchPage:async(url,ip)=>{calls++;assert.equal(ip,'8.8.8.8');assert.equal(url.hostname,'www.example.org');return{status:200,headers:{'content-type':'text/html'},body:fixture,bytes:fixture.length,durationMs:23};}
 });
 assert.equal(calls,1);
 assert.equal(output.status,200);
 assert.equal(output.durationMs,23);
 assert.equal(output.mode,'single_verified_http_get');
 assert.match(output.notice,/not run a browser/);
});
test('Redirects and non-HTML responses are never followed',async()=>{
 const opts={verify:async()=>({verified:true,hostname:'www.example.org'}),dnsCheck:async()=>['8.8.8.8']};
 await assert.rejects(()=>inspectVerifiedPage(plan,{...opts,fetchPage:async()=>({status:302,headers:{location:'https://evil.example'},body:'',durationMs:1})}),/redirect/);
 await assert.rejects(()=>inspectVerifiedPage(plan,{...opts,fetchPage:async()=>({status:200,headers:{'content-type':'application/octet-stream'},body:'',durationMs:1})}),/HTML/);
});

test('Retries another verified public IP after a transport failure',async()=>{
 const attempts=[];
 const output=await inspectVerifiedPage(plan,{
  verify:async()=>({verified:true,hostname:'www.example.org'}),
  dnsCheck:async()=>['8.8.8.8','1.1.1.1'],
  fetchPage:async(_url,ip)=>{
   attempts.push(ip);
   if(ip==='8.8.8.8')throw Object.assign(new Error('Connection reset'),{code:'ECONNRESET'});
   return {status:200,headers:{'content-type':'text/html'},body:fixture,bytes:fixture.length,durationMs:12};
  }
 });
 assert.deepEqual(attempts,['8.8.8.8','1.1.1.1']);
 assert.equal(output.ok,true);
});
test('Reports a safe actionable category after all verified IPs fail',async()=>{
 const opts={
  verify:async()=>({verified:true,hostname:'www.example.org'}),
  dnsCheck:async()=>['8.8.8.8','1.1.1.1'],
  fetchPage:async()=>{throw Object.assign(new Error('private transport details'),{code:'ETIMEDOUT'});}
 };
 await assert.rejects(()=>inspectVerifiedPage(plan,opts),e=>{
  assert.equal(e.status,424);
  assert.match(e.message,/timeout/);
  assert.doesNotMatch(e.message,/private transport details/);
  return true;
 });
});
