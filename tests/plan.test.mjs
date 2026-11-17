import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlan,safePath,toSyntheticUrl,UTM_KEYS,COUNTRIES,DEVICES} from '../src/plan.mjs';
import {isPublicIp,verifyOwnership} from '../src/ownership.mjs';
import {buildGA4Event} from '../src/ga4.mjs';
const valid={targetUrl:'https://www.example.org/',authorized:true,verificationToken:'tg_1234567890abcdefgh',sessions:4,concurrency:2,
 countries:['US','AE'],devices:['desktop','iphone'],analytics:{enabled:true,measurementId:'G-TEST1234',utm:{utm_source:'qa_team',utm_medium:'test',utm_campaign:'launch'}}};
test('validates bounded plans and retains GA4 test fields',()=>{
 const p=normalizePlan(valid);assert.equal(p.sessions,4);assert.equal(p.analytics.utm.utm_source,'qa_team');assert.equal(p.synthetic,true);
 assert.equal(p.countryOriginMode,'emulated-browser-locale-not-source-IP');
 assert.equal(UTM_KEYS.length,9);assert.ok(COUNTRIES.NA);assert.ok(DEVICES.ipad);
});
test('refuses unauthorized and excessive traffic',()=>{
 assert.throws(()=>normalizePlan({...valid,authorized:false}),/authorized/);
 assert.throws(()=>normalizePlan({...valid,sessions:10000}),/sessions/);
 assert.throws(()=>normalizePlan({...valid,concurrency:15}),/concurrency/);
 assert.throws(()=>normalizePlan({...valid,intervalSeconds:1}),/intervalSeconds/);
 assert.throws(()=>normalizePlan({...valid,targetUrl:'http://localhost:3000'}),/HTTPS/);
});
test('safe path avoids off-site and dangerous links',()=>{
 assert.equal(safePath('https://www.example.org/about','https://www.example.org'),true);
 assert.equal(safePath('https://evil.example.org/home','https://www.example.org'),false);
 assert.equal(safePath('https://www.example.org/checkout','https://www.example.org'),false);
 assert.equal(safePath('https://www.example.org/logout','https://www.example.org'),false);
});
test('public IP classification excludes private and reserved networks',()=>{
 assert.equal(isPublicIp('8.8.8.8'),true);assert.equal(isPublicIp('10.0.0.1'),false);
 assert.equal(isPublicIp('127.0.0.1'),false);assert.equal(isPublicIp('169.254.169.254'),false);
 assert.equal(isPublicIp('192.168.0.1'),false);assert.equal(isPublicIp('::1'),false);
});
test('requires exact verification token without redirects',async()=>{
 const headers=new Headers({'content-length':'23'});
 const fetchImpl=async()=>({status:200,headers,text:async()=>valid.verificationToken});
 const r=await verifyOwnership(valid.targetUrl,valid.verificationToken,{fetchImpl,dnsCheck:async()=>['8.8.8.8']});
 assert.equal(r.verified,true);
 await assert.rejects(()=>verifyOwnership(valid.targetUrl,valid.verificationToken,{fetchImpl:async()=>({status:302,headers,text:async()=>valid.verificationToken}),dnsCheck:async()=>[]}),/HTTP 200/);
});
test('GA4 payload remains distinctly synthetic and avoids fake acquisition events',()=>{
 const p=normalizePlan(valid),event=buildGA4Event(p,{index:1,durationMs:1200,countryCode:'AE',device:'iphone',status:200,pages:[{}],ok:true});
 assert.equal(event.events[0].name,'visitorlab_synthetic_visit');
 assert.equal(event.events[0].params.tg_synthetic,1);
 assert.equal(event.events[0].params.tg_utm_source,'qa_team');
 assert.equal(toSyntheticUrl(valid.targetUrl,p).includes('utm_source'),false);
});
