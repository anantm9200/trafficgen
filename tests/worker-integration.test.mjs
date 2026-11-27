import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const file=(p)=>join(root,p);

// Isolated in-memory browser fixture: no external website or analytics calls.
test('optimized run integrates with Playwright-style browser process and closes all contexts',async()=>{
 const base=await mkdtemp(join(tmpdir(),'trafficgen-worker-'));
 try{
  for(const p of ['worker/run.mjs','src/execution-engine.mjs','src/resource-budget.mjs','src/report-storage.mjs','src/worker-journey-plan.mjs','src/journey-runtime.mjs','src/campaign-definition.mjs','src/browser-policy.mjs','src/report-safety.mjs']){
   const dst=join(base,p);await mkdir(dirname(dst),{recursive:true});await copyFile(file(p),dst);
  }
  const src=join(base,'src');
  const modules={
   'plan.mjs':`export const COUNTRIES={AE:{locale:'en-AE',timezoneId:'Asia/Dubai',geolocation:{latitude:25,longitude:55}}};
export const DEVICES={desktop:{preset:'Desktop Chrome'}};
export const normalizePlan=x=>x;
export const safePath=(url,origin)=>new URL(url).origin===origin;
export const toSyntheticUrl=url=>url;
export const publicPlan=p=>({...p,verificationToken:'[redacted]'});
export const msSummary=a=>({p50:a.length?a[0]:null,p95:a.length?a.at(-1):null});`,
   'ownership.mjs':`export async function verifyOwnership(){return true}`,
   'ga4.mjs':`export async function submitGA4(){throw Error('Synthetic QA ingestion forbidden')}`,
   'analytics-observe.mjs':`export function classifyAnalyticsRequest(){return null};export function summarizeAnalyticsRequests(){return {observed:0}}`,
   'intelligence.mjs':`export async function analyzeWithDGX(){return {}}`
  };
  for(const [name,content] of Object.entries(modules))await writeFile(join(src,name),content);
  const pkg=join(base,'node_modules/playwright');await mkdir(pkg,{recursive:true});
  await writeFile(join(pkg,'package.json'),JSON.stringify({name:'playwright',type:'module',exports:'./index.mjs'}));
  await writeFile(join(pkg,'index.mjs'),`
export const counters={launch:0,browserClose:0,contexts:0,contextClose:0};
export const devices={'Desktop Chrome':{isMobile:false}};
export const chromium={launch:async()=>{
 counters.launch++;
 return {close:async()=>{counters.browserClose++},newContext:async()=>{
 counters.contexts++;
 return {setDefaultTimeout(){},route:async()=>{},close:async()=>{counters.contextClose++},
 newPage:async()=>{let current='https://owned.example.com/';return {on(){},url:()=>current,goto:async url=>{current=url;return {status:()=>200}},
 locator:selector=>({first:()=>({count:async()=>0}),evaluateAll:async()=>[],isVisible:async()=>selector!=='#missing'}),mouse:{wheel:async()=>{}}};}};
 }};
}};
`);
  const mod=await import(pathToFileURL(join(base,'worker/run.mjs')).href);
  const mock=await import(pathToFileURL(join(pkg,'index.mjs')).href);
  const plan={targetUrl:'https://owned.example.com/',verificationToken:'[mock-owned]',verificationMethod:'dns_txt',
    browser:'chromium',countries:['AE'],devices:['desktop'],sessions:3,concurrency:2,intervalSeconds:0,dwellSeconds:0,maxPages:1,
    interactions:{hover:false,scroll:false,navigate:false,checkImages:false},analytics:{enabled:false},runId:'mock-run-id'};
  const report=await mod.execute(plan);
  assert.equal(report.summary.passed,3);
  assert.equal(report.summary.failed,0);
  assert.equal(mock.counters.launch,1);
  assert.equal(mock.counters.browserClose,1);
  assert.equal(mock.counters.contexts,3);
  assert.equal(mock.counters.contextClose,3);
  assert.ok(report.summary.performance.browserStartupMs>=0);
  assert.equal(report.summary.performance.pacing.peakActive<=1,true);
  assert.equal(report.summary.performance.resourceAdmission.concurrency,1);
  assert.equal(report.sessions.length,3);
  assert.equal(report.plan.verificationToken,'[redacted]');
  assert.equal(report.originIPCountry,'not_asserted');
  const explicit={...plan,sessions:1,concurrency:1,intervalSeconds:8,maxPages:2,
   journeyExecutionMode:'explicit-safe-steps',requestedJourney:[
    {action:'navigate',path:'/'},{action:'assert',selector:'h1'},{action:'navigate',path:'/about'}]};
  const withSteps=await mod.execute(explicit);
  assert.equal(withSteps.summary.passed,1);
  assert.equal(withSteps.sessions[0].journey.ok,true);
  assert.deepEqual(withSteps.sessions[0].journey.steps.map(s=>s.action),['navigate','assert','navigate']);
  assert.equal(withSteps.sessions[0].pages.length,2);
  assert.equal(new URL(withSteps.sessions[0].pages[1].url).pathname,'/about');
  const failing={...explicit,requestedJourney:[{action:'navigate',path:'/'},{action:'assert',selector:'#missing'},
   {action:'navigate',path:'/about'}]};
  const stopped=await mod.execute(failing);
  assert.equal(stopped.summary.failed,1);
  assert.equal(stopped.sessions[0].journey.ok,false);
  assert.equal(stopped.sessions[0].pages.length,1);
  assert.equal(stopped.sessions[0].journey.steps.length,2);
  assert.match(stopped.sessions[0].error,/Explicit journey failed at step 2/);

 }finally{await rm(base,{recursive:true,force:true});}
});
