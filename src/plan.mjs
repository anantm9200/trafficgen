import { randomUUID } from 'node:crypto';

export const COUNTRIES = Object.freeze({
  US:{name:'United States',locale:'en-US',timezoneId:'America/New_York',geolocation:{latitude:40.7128,longitude:-74.0060}},
  IN:{name:'India',locale:'en-IN',timezoneId:'Asia/Kolkata',geolocation:{latitude:19.0760,longitude:72.8777}},
  AE:{name:'United Arab Emirates',locale:'en-AE',timezoneId:'Asia/Dubai',geolocation:{latitude:25.2048,longitude:55.2708}},
  DE:{name:'Germany',locale:'de-DE',timezoneId:'Europe/Berlin',geolocation:{latitude:52.52,longitude:13.405}},
  GB:{name:'United Kingdom',locale:'en-GB',timezoneId:'Europe/London',geolocation:{latitude:51.5072,longitude:-0.1276}},
  FR:{name:'France',locale:'fr-FR',timezoneId:'Europe/Paris',geolocation:{latitude:48.8566,longitude:2.3522}},
  SG:{name:'Singapore',locale:'en-SG',timezoneId:'Asia/Singapore',geolocation:{latitude:1.3521,longitude:103.8198}},
  AU:{name:'Australia',locale:'en-AU',timezoneId:'Australia/Sydney',geolocation:{latitude:-33.8688,longitude:151.2093}},
  CA:{name:'Canada',locale:'en-CA',timezoneId:'America/Toronto',geolocation:{latitude:43.6532,longitude:-79.3832}},
  ZA:{name:'South Africa',locale:'en-ZA',timezoneId:'Africa/Johannesburg',geolocation:{latitude:-26.2041,longitude:28.0473}},
  NA:{name:'Namibia',locale:'en-NA',timezoneId:'Africa/Windhoek',geolocation:{latitude:-22.5609,longitude:17.0658}},
  TZ:{name:'Tanzania',locale:'en-TZ',timezoneId:'Africa/Dar_es_Salaam',geolocation:{latitude:-6.7924,longitude:39.2083}}
});
export const DEVICES=Object.freeze({
  desktop:{name:'Desktop',preset:'Desktop Chrome',class:'desktop'},
  iphone:{name:'iPhone',preset:'iPhone 13',class:'mobile'},
  android:{name:'Android',preset:'Galaxy S9+',class:'mobile'},
  ipad:{name:'iPad',preset:'iPad Pro 11',class:'tablet'},
  tablet:{name:'Android tablet',preset:'Galaxy Tab S4',class:'tablet'}
});
export const UTM_KEYS=['utm_source','utm_medium','utm_campaign','utm_id','utm_term','utm_content','utm_source_platform','utm_creative_format','utm_marketing_tactic'];
const DISALLOWED=/^(?:localhost|.+\.localhost|.+\.local|.+\.internal|.+\.test|.+\.invalid|.+\.example)$/i;
const DANGEROUS=/(?:^|\/|[-_])(delete|logout|remove|unsubscribe|cancel|pay|purchase|checkout|transfer|destroy|terminate|reset|submit|confirm)(?:$|\/|[-_.])/i;
export function error(message,status=400){const e=new Error(message);e.status=status;return e;}
export function parseTarget(raw){
 if(typeof raw!=='string'||raw.length>2048)throw error('targetUrl must be a public HTTPS URL');
 let u;try{u=new URL(raw);}catch{throw error('Invalid targetUrl');}
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.hostname.length>253||!u.hostname.includes('.')||DISALLOWED.test(u.hostname)||/^\d/.test(u.hostname)||u.hostname.includes(':'))throw error('Only public HTTPS DNS hostnames on port 443 are supported');
 if(u.hash)u.hash='';return u;
}
export function safePath(u,origin){
 try{const p=new URL(u,origin);if(p.origin!==origin||p.protocol!=='https:'||DANGEROUS.test(decodeURIComponent(p.pathname)))return false;
 for(const [k,v] of p.searchParams)if(DANGEROUS.test('/'+k+'/')||DANGEROUS.test('/'+v+'/'))return false;
 if(/\.(pdf|zip|exe|dmg|msi|pkg)(?:$|\?)/i.test(p.pathname))return false;
 return true;}catch{return false;}
}
const integer=(v,f,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw error(f+' must be between '+min+' and '+max);return v;};
const text=(v,f,max=100)=>{if(typeof v!=='string'||v.length>max||/[<>\r\n]/.test(v))throw error('Invalid '+f);return v.trim();};
export function normalizePlan(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw error('JSON object required');
 const target=parseTarget(input.targetUrl);
 if(!safePath(target.href,target.origin))throw error('Unsafe test target path');
 if(input.authorized!==true)throw error('authorized:true is required. You must own or have permission for the target.');
 const verificationToken=text(input.verificationToken,'verificationToken',120);
 const verificationMethod=input.verificationMethod??'dns_txt';
 if(!['dns_txt','http_file'].includes(verificationMethod))throw error('Invalid website ownership verification method');
 if(!/^tg_[A-Za-z0-9_-]{16,100}$/.test(verificationToken))throw error('verificationToken must look like tg_ followed by at least 16 letters or digits');
 const countries=input.countries??['US'];
 if(!Array.isArray(countries)||countries.length<1||countries.length>8||new Set(countries).size!==countries.length||countries.some(c=>typeof c!=='string'||!Object.hasOwn(COUNTRIES,c)))throw error('Select 1–8 unique supported country codes');
 const devices=input.devices??['desktop','iphone'];
 if(!Array.isArray(devices)||devices.length<1||devices.length>5||new Set(devices).size!==devices.length||devices.some(d=>typeof d!=='string'||!Object.hasOwn(DEVICES,d)))throw error('Invalid device profiles');
 const browser=input.browser??'chromium';
 if(!['chromium','firefox','webkit'].includes(browser))throw error('Invalid browser engine');
 const sessions=integer(input.sessions??6,'sessions',1,25);
 const concurrency=integer(input.concurrency??1,'concurrency',1,3);
 const intervalSeconds=integer(input.intervalSeconds??8,'intervalSeconds',6,120);
 const dwellSeconds=integer(input.dwellSeconds??15,'dwellSeconds',8,60);
 const maxPages=integer(input.maxPages??2,'maxPages',1,4);
 const analytics=input.analytics??{};
 if(typeof analytics!=='object'||analytics===null||Array.isArray(analytics))throw error('analytics must be object');
 const measurementId=analytics.measurementId===undefined?'':text(analytics.measurementId,'measurementId',32);
 if(measurementId&&!/^G-[A-Z0-9]{5,20}$/.test(measurementId))throw error('GA4 measurementId must look like G-XXXXXXXX');
 const utm={};
 for(const k of UTM_KEYS){const v=analytics.utm?.[k];if(v!==undefined&&v!=='')utm[k]=text(v,k,80);}
 return {
  schemaVersion:1,runId:(typeof input.runId==='string'&&/^[a-f0-9-]{36}$/.test(input.runId))?input.runId:randomUUID(),
  name:text(input.name??'Authorized browser test','name',80),
  targetUrl:target.toString(),authorized:true,verificationToken,verificationMethod,
  sessions,concurrency,intervalSeconds,dwellSeconds,maxPages,countries,devices,browser,
  interactions:{
   scroll:input.interactions?.scroll!==false,
   hover:input.interactions?.hover!==false,
   navigate:input.interactions?.navigate!==false,
   checkImages:input.interactions?.checkImages!==false
  },
  analytics:{enabled:analytics.enabled===true,measurementId,utm},
  synthetic:true,
  countryOriginMode:'emulated-browser-locale-not-source-IP',
  createdAt:new Date().toISOString()
 };
}
// Query strings and fragments may contain identifiers or access tokens; never persist them in public evidence.
export function evidenceUrl(raw){try{const u=new URL(raw);return (u.origin+u.pathname).slice(0,500);}catch{return '[invalid URL]';}}
export function publicPlan(p){const {verificationToken,...rest}=p;return {...rest,targetUrl:evidenceUrl(p.targetUrl),verificationToken:'[redacted]'};}
export function toSyntheticUrl(raw,plan){
 const url=new URL(raw);
 url.searchParams.set('visitorlab_test','1');
 // Never add UTM fields to site URLs: the site's own GA tag may mistake them for customer acquisition.
 return url.toString();
}
export function msSummary(values){if(!values.length)return{p50:null,p95:null};const a=[...values].sort((x,y)=>x-y);return{p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1]};}
