import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decideBrowserRequest} from '../src/browser-policy.mjs';
import {safeReportUrl,safeReportMessage} from '../src/report-safety.mjs';

const base='https://owned.example.org';
const decision=(url,{method='GET',resourceType='script',isNavigation=false}={})=>
 decideBrowserRequest({url,origin:base,method,resourceType,isNavigation});

test('permitted analytics library loads but not analytics collection',()=>{
 assert.equal(decision('https://www.googletagmanager.com/gtag/js?id=G-TEST').allow,true);
 assert.equal(decision('https://va.vercel-scripts.com/v1/script.js').allow,true);
 assert.equal(decision('https://www.google-analytics.com/g/collect?v=2').allow,false);
 assert.equal(decision('https://vitals.vercel-insights.com/v1/view').allow,false);
 assert.equal(decision('https://www.googletagmanager.com/unknown.js').allow,false);
});

test('out-of-origin navigation and unsafe methods are blocked',()=>{
 assert.equal(decision('https://external.example.com/',{resourceType:'document',isNavigation:true}).allow,false);
 assert.equal(decision(base+'/form',{resourceType:'document',method:'POST'}).allow,false);
 assert.equal(decision('http://owned.example.org/home').allow,false);
 assert.equal(decision(base+'/home',{resourceType:'document',isNavigation:true}).owned,true);
});

test('browser QA evidence redacts query strings and credentials',()=>{
 assert.equal(safeReportUrl(base+'/page?token=private#frag'),base+'/page');
 const result=safeReportMessage('Bad '+base+'/page?password=private Bearer secret_token api_secret=secret');
 assert.equal(result.includes('password=private'),false);
 assert.equal(result.includes('secret_token'),false);
 assert.equal(result.includes('api_secret=secret'),false);
});

test('production monitor and browser test support versioned JavaScript assets',()=>{
 const monitor=readFileSync(new URL('../scripts/monitor-production.mjs',import.meta.url),'utf8');
 const smoke=readFileSync(new URL('./dashboard-browser.test.mjs',import.meta.url),'utf8');
 assert.equal(monitor.includes('html.text.includes('+'\\'src="/app.js"\\''+')'),false);
 assert.match(monitor,/app\\\.js/);
 assert.match(smoke,/app\\\.js/);
});

test('DGX job listings are bounded summaries and job reports remain retrievable',()=>{
 const worker=readFileSync(new URL('../worker/dgx-queue.mjs',import.meta.url),'utf8');
 assert.match(worker,/reportAvailable:Boolean/);
 assert.match(worker,/job:publicJob\(row,true\)/);
 assert.match(worker,/json_extract\(plan/);
});
