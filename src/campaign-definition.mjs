import {randomUUID} from 'node:crypto';
const COUNTRIES=new Set(['US','IN','AE','DE','GB','FR','SG','AU','CA','ZA','NA','TZ']);
const DEVICES=new Set(['desktop','iphone','android','ipad','tablet']);
const PROHIBITED=/(?:^|\/|[-_])(delete|logout|remove|unsubscribe|cancel|pay|purchase|checkout|transfer|destroy|terminate|reset|submit|confirm)(?:$|\/|[-_.])/i;
const MAX_DAYS=30;
function bounded(value,min,max,name){if(!Number.isInteger(value)||value<min||value>max)throw new Error(name+' outside allowed range');return value}
function text(value,max,name){if(typeof value!=='string'||value.trim().length<1||value.length>max||/[<>\r\n]/.test(value))throw new Error('Invalid '+name);return value.trim()}
function publicOrigin(value){
 let u;try{u=new URL(value)}catch{throw new Error('Valid HTTPS website required')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^\d/.test(u.hostname)||
  /(?:\.local|\.internal|\.test|\.example|\.invalid|\.localhost)$/i.test(u.hostname))throw new Error('Public HTTPS hostname required');
 return u.origin;
}
function safePath(path,origin){
 const u=new URL(path,origin);
 if(u.origin!==origin||u.protocol!=='https:'||PROHIBITED.test(decodeURIComponent(u.pathname))||
  /\.(pdf|zip|exe|dmg|msi|pkg)$/i.test(u.pathname))throw new Error('Out-of-scope or unsafe journey path');
 for(const [k,v] of u.searchParams)if(PROHIBITED.test('/'+k+'/')||PROHIBITED.test('/'+v+'/'))throw new Error('Unsafe journey query');
 if(u.hash)u.hash='';
 return u.pathname+u.search;
}
export function validateCampaignDraft(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Campaign required');
 const origin=publicOrigin(raw.siteUrl);
 const steps=raw.journey;
 if(!Array.isArray(steps)||steps.length<1||steps.length>12)throw new Error('Journey requires 1–12 safe steps');
 const journey=steps.map((step,i)=>{
  if(!step||typeof step!=='object'||Array.isArray(step))throw new Error('Invalid journey step '+i);
  if(step.action==='navigate')return {action:'navigate',path:safePath(text(step.path,300,'path'),origin)};
  if(step.action==='scroll')return {action:'scroll',distancePx:bounded(step.distancePx,100,1500,'scroll distance')};
  if(step.action==='dwell')return {action:'dwell',seconds:bounded(step.seconds,1,30,'dwell')};
  if(step.action==='assert')return {action:'assert',selector:text(step.selector,100,'selector')};
  throw new Error('Unsupported or potentially mutating journey action');
 });
 if(journey[0].action!=='navigate')throw new Error('The first step must navigate to an owned page');
 const navs=journey.filter(x=>x.action==='navigate');
 if(navs.length>4)throw new Error('Maximum 4 page navigations');
 const devices=raw.devices??['desktop'];
 const regions=raw.regions??['AE'];
 if(!Array.isArray(devices)||!devices.length||devices.length>5||new Set(devices).size!==devices.length||devices.some(x=>!DEVICES.has(x)))throw new Error('Invalid device selection');
 if(!Array.isArray(regions)||!regions.length||regions.length>8||new Set(regions).size!==regions.length||regions.some(x=>!COUNTRIES.has(x)))throw new Error('Invalid browser locale selection');
 const sessions=bounded(raw.sessions??1,1,25,'sessions');
 const concurrency=bounded(raw.concurrency??1,1,1,'DGX concurrency');
 const intervalSeconds=bounded(raw.intervalSeconds??8,6,120,'session interval');
 const schedule=raw.schedule??{type:'manual'};
 let scheduled={type:'manual'};
 if(schedule.type==='recurring'){
  const start=Date.parse(schedule.startAt),end=Date.parse(schedule.endAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>MAX_DAYS*86400000)throw new Error('Invalid recurring window');
  const everyMinutes=bounded(schedule.everyMinutes,30,1440,'recurring interval');
  if(everyMinutes%30!==0)throw new Error('Recurring interval must be a multiple of 30 minutes');
  const dailyBudget=bounded(schedule.dailyBudget,1,100,'daily session budget');
  if(dailyBudget<sessions)throw new Error('Daily budget smaller than one run');
  scheduled={type:'recurring',startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),everyMinutes,dailyBudget};
 }else if(schedule.type!=='manual')throw new Error('Unsupported schedule type');
 const analyticsMode=raw.analyticsMode??'observe-only';
 if(!['observe-only','isolated-qa'].includes(analyticsMode))throw new Error('Analytics mode must not ingest synthetic sessions into production');
 return Object.freeze({
  name:text(raw.name??'Authorized QA campaign',80,'campaign name'),siteUrl:origin,
  journey,devices:[...devices],regions:[...regions],sessions,concurrency,intervalSeconds,
  schedule:scheduled,analyticsMode,synthetic:true,
  originMode:'browser-emulation-only-not-network-egress',
 });
}
/** Dispatch data is assembled only with a fresh site-verification credential. */
export function compileBrowserPlan(draft,{verificationToken,verificationMethod='dns_txt',runId=randomUUID()}={}){
 const c=validateCampaignDraft(draft);
 if(!/^tg_[A-Za-z0-9_-]{16,100}$/.test(verificationToken??''))throw new Error('Verified site token required at dispatch');
 if(!['dns_txt','http_file'].includes(verificationMethod))throw new Error('Invalid verification method');
 if(!/^[a-f\d-]{36}$/i.test(runId))throw new Error('Invalid run identifier');
 const landing=c.journey[0].path;
 // Explicit steps must be executed by the worker, never silently replaced by auto-browse.
 return {
  name:c.name,targetUrl:c.siteUrl+landing,authorized:true,verificationToken,verificationMethod,runId,
  countries:c.regions,devices:c.devices,browser:'chromium',sessions:c.sessions,
  concurrency:c.concurrency,intervalSeconds:c.intervalSeconds,
  dwellSeconds:8,maxPages:Math.min(4,c.journey.filter(x=>x.action==='navigate').length),
  interactions:{scroll:true,hover:true,navigate:true,checkImages:true},
  analytics:{enabled:false},synthetic:true,
  requestedJourney:c.journey,journeyExecutionMode:'explicit-safe-steps',
  analyticsMode:c.analyticsMode
 };
}
/** UTC scheduler makes budgeting predictable; it never backfills missed runs. */
export function nextCampaignTick(draft,{now=Date.now(),lastRunAt=null,completedSessionsToday=0}={}){
 const c=validateCampaignDraft(draft);
 if(c.schedule.type==='manual')return {due:false,reason:'manual_campaign'};
 const s=c.schedule,begin=Date.parse(s.startAt),end=Date.parse(s.endAt);
 if(now>end)return {due:false,reason:'schedule_expired'};
 const earliest=Math.max(begin,lastRunAt===null?begin:Date.parse(lastRunAt)+s.everyMinutes*60000);
 if(!Number.isFinite(earliest))throw new Error('Invalid last run timestamp');
 if(earliest>end)return {due:false,reason:'schedule_expired'};
 if(completedSessionsToday+c.sessions>s.dailyBudget)return {due:false,reason:'daily_budget'};
 return now>=earliest?{due:true,at:new Date(now).toISOString()}:{due:false,reason:'not_due',nextAt:new Date(earliest).toISOString()};
}
