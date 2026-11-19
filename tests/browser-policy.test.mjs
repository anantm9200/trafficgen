import test from 'node:test';
import assert from 'node:assert/strict';
import {decideBrowserRequest as decide} from '../src/browser-policy.mjs';
const origin='https://owned.example.org';
const allowed=(url,opts={})=>decide({origin,url,...opts});
test('same-origin navigation is permitted for verified target, with safePath enforced by worker',()=>{
 const r=allowed(origin+'/news',{resourceType:'document',isNavigation:true});
 assert.equal(r.allow,true);assert.equal(r.owned,true);
});
test('analytics tag scripts load so measurement attempts can be observed',()=>{
 for(const url of [
  'https://www.googletagmanager.com/gtag/js?id=G-TEST12345',
  'https://www.googletagmanager.com/gtm.js?id=GTM-EXAMPLE',
  'https://va.vercel-scripts.com/v1/script.js',
  'https://va.vercel-scripts.com/v1/speed-insights/script.js'
 ]){
  const r=allowed(url,{resourceType:'script'});
  assert.equal(r.allow,true,url);assert.equal(r.reason,'analytics_tag_only');
 }
});
test('analytics collection requests are blocked even when scripts are allowed',()=>{
 for(const url of [
  'https://www.google-analytics.com/g/collect?v=2',
  'https://www.googletagmanager.com/collect?v=2',
  'https://vitals.vercel-insights.com/v1/view',
  'https://va.vercel-scripts.com/v1/script.js?x=1'
 ]){
  const r=allowed(url,{resourceType:'fetch'});
  assert.equal(r.allow,false,url);
 }
});
test('external navigation and mutation are refused',()=>{
 assert.equal(allowed('https://www.googletagmanager.com/gtag/js',{resourceType:'document',isNavigation:true}).allow,false);
 assert.equal(allowed(origin+'/path',{method:'POST'}).allow,false);
 assert.equal(allowed('http://owned.example.org/a').allow,false);
});
test('only named CDNs may serve static resources, not arbitrary third-party URLs',()=>{
 assert.equal(allowed('https://fonts.gstatic.com/a.woff2',{resourceType:'font'}).allow,true);
 assert.equal(allowed('https://cdn.jsdelivr.net/npm/lib.js',{resourceType:'script'}).allow,true);
 assert.equal(allowed('https://evil.example.net/payload.js',{resourceType:'script'}).allow,false);
 assert.equal(allowed('https://cdn.jsdelivr.net/api/telemetry',{resourceType:'fetch'}).allow,false);
});
test('unsafe schemes and malformed destinations fail closed',()=>{
 for(const url of ['javascript:alert(1)','http://example.org/','not a url'])
  assert.equal(allowed(url).allow,false,url);
});
