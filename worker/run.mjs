import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {normalizePlan,COUNTRIES,DEVICES,safePath,toSyntheticUrl,publicPlan,msSummary} from '../src/plan.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
import {submitGA4} from '../src/ga4.mjs';
import {analyzeWithDGX} from '../src/intelligence.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BLOCKED_HOSTS=['google-analytics.com','googletagmanager.com','doubleclick.net','facebook.com','connect.facebook.net','clarity.ms','hotjar.com','segment.io','plausible.io','posthog.com'];
const STATIC_HOSTS=new Set(['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net','cdnjs.cloudflare.com','unpkg.com','images.unsplash.com']);
const matches=(host,base)=>host===base||host.endsWith('.'+base);
function guardedRoute(route,origin){
 const request=route.request();let u;
 try{u=new URL(request.url());}catch{return route.abort();}
 if(u.protocol==='data:'||u.protocol==='blob:')return route.continue();
 if(u.protocol!=='https:')return route.abort();
 if(!['GET','HEAD'].includes(request.method()))return route.abort();
 if(BLOCKED_HOSTS.some(h=>matches(u.hostname,h)))return route.abort();
 if(request.isNavigationRequest()&&u.origin!==origin)return route.abort();
 if(u.origin===origin){
  if(!safePath(u.href,origin))return route.abort();
  return route.continue({headers:{...request.headers(),'x-synthetic-test':'visitorlab','x-visitorlab-test':'true'}});
 }
 if(STATIC_HOSTS.has(u.hostname)&&['stylesheet','font','image','script'].includes(request.resourceType()))return route.continue();
 return route.abort();
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
  result.pages.push({url:page.url().slice(0,500),status,durationMs:elapsed});
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
  brokenImages:0,ok:false,error:null,ga4:{sent:false,reason:'not attempted'}};
 let context;
 const started=performance.now();
 try{
  context=await browser.newContext({...preset,locale:country.locale,timezoneId:country.timezoneId,
    geolocation:country.geolocation,permissions:['geolocation'],acceptDownloads:false,serviceWorkers:'block'});
  context.setDefaultTimeout(5000);
  const origin=new URL(plan.targetUrl).origin;
  await context.route('**/*',route=>guardedRoute(route,origin));
  const page=await context.newPage();
  page.on('pageerror',e=>{if(result.jsErrors.length<15)result.jsErrors.push(String(e.message).slice(0,300));});
  page.on('response',r=>{if(r.url().startsWith(origin+'/')&&r.status()>=400){
   result.httpErrors.push({status:r.status(),url:r.url().slice(0,300)});
   if(r.status()===403||r.status()===429||r.status()>=500)shared.abort=true;
  }});
  page.on('requestfailed',r=>{if(result.requestFailures.length<15&&r.url().startsWith(origin+'/'))
   result.requestFailures.push(r.url().slice(0,300));});
  await browse(page,plan,result);
  result.ok=!result.error&&result.pages.length>0&&result.pages.every(p=>p.status>=200&&p.status<400);
 }catch(e){result.error=String(e?.message||e).slice(0,500);}
 finally{
  result.durationMs=Math.round(performance.now()-started);
  result.endedAt=new Date().toISOString();
  if(context)await context.close().catch(()=>{});
  if(plan.analytics.enabled)try{result.ga4=await submitGA4(plan,result);}catch(e){result.ga4={sent:false,reason:String(e.message).slice(0,200)};}
 }
 return result;
}
export async function execute(planRaw,{launchBrowsers=true}={}){
 const plan=normalizePlan(planRaw);
 await verifyOwnership(plan.targetUrl,plan.verificationToken);
 const startedAt=new Date().toISOString();
 const playwright=await import('playwright');
 const browser=await playwright[plan.browser].launch({headless:true});
 const results=new Array(plan.sessions);
 const shared={abort:false},workers=[];
 let cursor=0;let lastStart=0;let pacing=Promise.resolve();
 async function paced(){
  let release;const previous=pacing;pacing=new Promise(r=>{release=r;});
  await previous;
  try{const delay=Math.max(0,lastStart+plan.intervalSeconds*1000-Date.now());if(delay)await sleep(delay);lastStart=Date.now();}
  finally{release();}
 }
 async function loop(){
  while(!shared.abort){
   const index=cursor++;
   if(index>=plan.sessions)break;
   await paced();if(shared.abort)break;
   results[index]=await runOne(index,plan,browser,playwright,shared);
   const r=results[index];console.log('SESSION',r.index,r.ok?'PASS':'FAIL',r.status||'-',r.durationMs+'ms');
  }
 }
 try{for(let i=0;i<Math.min(plan.sessions,plan.concurrency);i++)workers.push(loop());
  await Promise.all(workers);}
 finally{await browser.close();}
 const completed=results.filter(Boolean);
 const timings=completed.flatMap(x=>x.pages.map(p=>p.durationMs));
 const summary={requested:plan.sessions,completed:completed.length,passed:completed.filter(x=>x.ok).length,
  failed:completed.filter(x=>!x.ok).length,pagesVisited:completed.reduce((n,x)=>n+x.pages.length,0),
  javaScriptErrors:completed.reduce((n,x)=>n+x.jsErrors.length,0),
  httpErrors:completed.reduce((n,x)=>n+x.httpErrors.length,0),
  brokenImages:completed.reduce((n,x)=>n+x.brokenImages,0),
  timingsMs:msSummary(timings),stoppedEarly:shared.abort,finishedAt:new Date().toISOString()};
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
 await mkdir('reports',{recursive:true});
 const filenameOut='reports/report-'+result.plan.runId+'.json';
 await writeFile(filenameOut,JSON.stringify(result,null,2)+'\n');
 console.log('REPORT',filenameOut,JSON.stringify(result.summary));
 if(result.summary.failed>0||result.summary.stoppedEarly)process.exitCode=1;
}
if(import.meta.url==='file://'+process.argv[1])main().catch(e=>{console.error('WORKER ERROR:',e.message);process.exitCode=1;});
