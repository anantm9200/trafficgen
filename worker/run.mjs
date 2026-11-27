import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {normalizePlan,COUNTRIES,DEVICES,safePath,toSyntheticUrl,publicPlan,msSummary} from '../src/plan.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
import {classifyAnalyticsRequest,summarizeAnalyticsRequests} from '../src/analytics-observe.mjs';
import {analyzeWithDGX} from '../src/intelligence.mjs';
import {runPacedSessions,withBrowser} from '../src/execution-engine.mjs';
import {sampleResourceAdmission} from '../src/resource-budget.mjs';
import {writePrivateReport} from '../src/report-storage.mjs';
import {normalizeJourneyPlan} from '../src/worker-journey-plan.mjs';
import {executeSafeJourney} from '../src/journey-runtime.mjs';
import {decideBrowserRequest} from '../src/browser-policy.mjs';
import {safeReportUrl,safeReportMessage} from '../src/report-safety.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function guardedRoute(route,origin){
 const request=route.request();
 const decision=decideBrowserRequest({url:request.url(),method:request.method(),
  resourceType:request.resourceType(),isNavigation:request.isNavigationRequest(),origin});
 if(!decision.allow)return route.abort();
 if(decision.owned){
  if(!safePath(request.url(),origin))return route.abort();
  return route.continue({headers:{...request.headers(),
   'x-synthetic-test':'visitorlab','x-visitorlab-test':'true'}});
 }
 return route.continue();
}
export async function browse(page,plan,result){
 const origin=new URL(plan.targetUrl).origin,visited=new Set();
 let current=toSyntheticUrl(plan.targetUrl,plan);
 for(let depth=0;depth<plan.maxPages;depth++){
  if(!safePath(current,origin))break;
  const t=performance.now();
  const response=await page.goto(current,{waitUntil:'domcontentloaded',timeout:20000});
  const elapsed=Math.round(performance.now()-t);
  const status=response?.status()??0;
  result.pages.push({url:safeReportUrl(page.url(),500),status,durationMs:elapsed});
  result.status=status;
  visited.add(new URL(page.url()).pathname);
  if(status===403||status===429||status>=500||status===0){result.error='Site blocked or rejected the test (HTTP '+status+')';break;}
  if(status>=400){result.error='HTTP '+status;break;}
  if(plan.interactions.hover){
   const nav=page.locator('nav a').first();
   if(await nav.count().catch(()=>0))await nav.hover({timeout:1200}).catch(()=>{});
  }
  if(plan.interactions.scroll){
   for(let i=0;i<3;i++){
    await page.mouse.wheel(0,340+i*110);
    await sleep(380+i*160);
   }
  }
  if(plan.interactions.checkImages){
   const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(x=>x.complete&&x.naturalWidth===0).length).catch(()=>0);
   result.brokenImages+=broken;
  }
  await sleep(Math.min(plan.dwellSeconds*1000,12000));
  if(!plan.interactions.navigate)break;
  const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.slice(0,150).map(el=>el.href)).catch(()=>[]);
  const next=links.map(h=>{try{return new URL(h,origin)}catch{return null}})
   .find(u=>u&&safePath(u.href,origin)&&!visited.has(u.pathname)&&u.origin===origin);
  if(!next)break;
  current=next.toString();
 }
}
async function runOne(index,plan,browser,playwright,shared){
 const countryCode=plan.countries[index%plan.countries.length];
 const device=plan.devices[Math.floor(index/plan.countries.length)%plan.devices.length];
 const country=COUNTRIES[countryCode];
 const preset=playwright.devices[DEVICES[device].preset]||{};
 const result={index:index+1,countryCode,countryMode:'locale_timezone_geolocation_only',device,
  browser:plan.browser,startedAt:new Date().toISOString(),pages:[],jsErrors:[],httpErrors:[],requestFailures:[],
  brokenImages:0,ok:false,error:null,ga4:{sent:false,reason:'not attempted'},analyticsRequests:[],analyticsSummary:null};
 let context;
 const started=performance.now();
 try{
  const contextStarted=performance.now();
  context=await browser.newContext({...preset,locale:country.locale,timezoneId:country.timezoneId,
    geolocation:country.geolocation,permissions:['geolocation'],acceptDownloads:false,serviceWorkers:'block'});
  context.setDefaultTimeout(5000);
  const origin=new URL(plan.targetUrl).origin;
  await context.route('**/*',route=>guardedRoute(route,origin));
  const page=await context.newPage();
  result.contextStartupMs=Math.round(performance.now()-contextStarted);
  page.on('request',request=>{const event=classifyAnalyticsRequest(request.url());if(event&&result.analyticsRequests.length<100)result.analyticsRequests.push(event);});
  page.on('pageerror',e=>{if(result.jsErrors.length<15)result.jsErrors.push(safeReportMessage(e.message,300));});
  page.on('response',r=>{if(r.url().startsWith(origin+'/')&&r.status()>=400){
   if(result.httpErrors.length<15)result.httpErrors.push({status:r.status(),url:safeReportUrl(r.url(),300)});
   if(r.status()===403||r.status()===429||r.status()>=500)shared.abort=true;
  }});
  page.on('requestfailed',r=>{if(result.requestFailures.length<15&&r.url().startsWith(origin+'/'))
   result.requestFailures.push(safeReportUrl(r.url(),300));});
  if(plan.requestedJourney){
   const journey=await executeSafeJourney(page,{siteUrl:origin,journey:plan.requestedJourney},{
    navigateUrl:url=>toSyntheticUrl(url,plan),
    onNavigation:({url,status,durationMs})=>{
     result.pages.push({url:safeReportUrl(url,500),status,durationMs});result.status=status;
     if([403,429].includes(status)||status>=500)shared.abort=true;
    }
   });
   result.journey=journey;
   if(!journey.ok)result.error='Explicit journey failed at step '+(journey.steps.at(-1)?.step??'?')+': '+(journey.steps.at(-1)?.error||'unknown');
  }else await browse(page,plan,result);
  result.ok=!result.error&&result.pages.length>0&&result.pages.every(p=>p.status>=200&&p.status<400)&&(!result.journey||result.journey.ok);
 }catch(e){result.error=safeReportMessage(e?.message||e,500);}
 finally{
  result.analyticsSummary=summarizeAnalyticsRequests(result.analyticsRequests);
  result.durationMs=Math.round(performance.now()-started);
  result.endedAt=new Date().toISOString();
  if(context)await context.close().catch(()=>{});
  // QA delivery is handled exclusively by the isolated QA-property service.
 }
 return result;
}
export async function execute(planRaw,{launchBrowsers=true}={}){
 const plan=normalizeJourneyPlan(planRaw,normalizePlan);
 if(plan.analytics?.enabled)throw new Error('Production GA4 collection is disabled; configure an isolated QA property');
 await verifyOwnership(plan.targetUrl,plan.verificationToken,{method:plan.verificationMethod});
 const startedAt=new Date().toISOString(),started=performance.now(),memoryStart=process.memoryUsage().rss;
 const resource=sampleResourceAdmission({requestedConcurrency:plan.concurrency,maxConcurrency:1});
 if(!resource.allowed)throw new Error('Worker resource budget unavailable: '+resource.reason);
 const playwright=await import('playwright');
 const shared={abort:false};
 // One browser per job. Reuse the browser across independent short-lived contexts,
 // keeping cookies, storage and service workers isolated for every synthetic test.
 const {value:execution,startupMs}=await withBrowser({
  launch:()=>playwright[plan.browser].launch({headless:true}),
  execute:browser=>runPacedSessions({
   sessions:plan.sessions,concurrency:resource.concurrency,
   intervalMs:plan.intervalSeconds*1000,
   shouldStop:()=>shared.abort,
   run:async index=>{
    const result=await runOne(index,plan,browser,playwright,shared);
    console.log('SESSION',result.index,result.ok?'PASS':'FAIL',result.status||'-',result.durationMs+'ms');
    return result;
   }
  })
 });
 const completed=execution.results.filter(Boolean);
 const timings=completed.flatMap(x=>x.pages.map(p=>p.durationMs));
 const summary={requested:plan.sessions,completed:completed.length,passed:completed.filter(x=>x.ok).length,
  failed:completed.filter(x=>!x.ok).length,pagesVisited:completed.reduce((n,x)=>n+x.pages.length,0),
  javaScriptErrors:completed.reduce((n,x)=>n+x.jsErrors.length,0),
  httpErrors:completed.reduce((n,x)=>n+x.httpErrors.length,0),
  brokenImages:completed.reduce((n,x)=>n+x.brokenImages,0),
  analyticsRequestsObserved:completed.reduce((n,x)=>n+x.analyticsRequests.length,0),
  timingsMs:msSummary(timings),stoppedEarly:shared.abort||execution.metrics.stoppedEarly,finishedAt:new Date().toISOString(),
  performance:{browserStartupMs:startupMs,executionWallMs:Math.round(performance.now()-started),resourceAdmission:resource,
   contextStartupMs:msSummary(completed.map(s=>s.contextStartupMs).filter(Number.isFinite)),
   workerNodeRssStartMiB:Math.round(memoryStart/1048576),workerNodeRssEndMiB:Math.round(process.memoryUsage().rss/1048576),
   pacing:execution.metrics}
 };
 return {plan:publicPlan(plan),originIPCountry:'not_asserted',startedAt,summary,sessions:completed};
}
async function main(){
 const env=process.argv.includes('--env-plan');
 const filename=process.argv.at(-1);
 if(!env&&(!filename||filename.startsWith('-')))throw new Error('Usage: node worker/run.mjs PLAN.json OR --env-plan');
 const json=env?Buffer.from(process.env.PLAN_B64||'','base64url').toString('utf8'):await readFile(resolve(filename),'utf8');
 if(json.length>16000)throw new Error('Plan too large');
 const result=await execute(JSON.parse(json));
 result.intelligence=await analyzeWithDGX(result);
 const filenameOut=await writePrivateReport('reports',result);
 console.log('REPORT',filenameOut,JSON.stringify(result.summary));
 if(result.summary.failed>0||result.summary.stoppedEarly)process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('WORKER ERROR:',e.message);process.exitCode=1;});
