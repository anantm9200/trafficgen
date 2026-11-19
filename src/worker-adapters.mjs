import {lookup,resolveTxt} from 'node:dns/promises';
import {isIP} from 'node:net';

const EXPECTED_DGX_ORIGIN='https://trafficgen-dgx-spark.iagatlas.com';
const TOKEN_PATTERN=/^tg_[A-Za-z0-9_-]{16,100}$/;
const deny=(message,status=403)=>Object.assign(new Error(message),{status});
function publicIp(ip){
 const type=isIP(ip);
 if(type===4){
  const [a,b,c]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||
   (a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||
   (a===192&&b===0)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));
 }
 return type===6&&/^[23][0-9a-f]{3}:/i.test(ip);
}
export function makeDnsOwnershipAdapter({lookupFn=lookup,resolveTxtFn=resolveTxt}={}){
 return async (rawUrl,token,{method='dns_txt'}={})=>{
  if(method!=='dns_txt')throw deny('Only DNS TXT verification supported by local orchestrator',400);
  if(!TOKEN_PATTERN.test(token||''))throw deny('Valid site ownership token required');
  let url;try{url=new URL(rawUrl)}catch{throw deny('Invalid site URL',400)}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^\d/.test(url.hostname))
   throw deny('Public HTTPS domain required',400);
  const addresses=await lookupFn(url.hostname,{all:true,verbatim:true});
  if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!publicIp(a.address)))throw deny('Domain resolves to private/reserved IP',403);
  const record='_visitorlab.'+url.hostname;
  let values;
  try{values=await resolveTxtFn(record)}catch{throw deny('Ownership DNS TXT record unavailable',403)}
  if(!Array.isArray(values)||!values.slice(0,100).some(v=>Array.isArray(v)&&v.join('').trim()==='visitorlab-verification='+token))
   throw deny('Ownership DNS TXT does not match',403);
  return {verified:true,method:'dns_txt',hostname:url.hostname};
 };
}
export function makeDgxAdapter({env=process.env,fetchImpl=fetch}={}){
 const base=env.DGX_API_URL;
 if(base&&base!==EXPECTED_DGX_ORIGIN&&base!==EXPECTED_DGX_ORIGIN+'/')throw new Error('DGX endpoint must be the explicitly approved origin');
 const getAuth=()=>{
  if(!base||!env.TG_DGX_JOB_TOKEN||env.TG_DGX_JOB_TOKEN.length<32||!env.CF_ACCESS_CLIENT_ID||!env.CF_ACCESS_CLIENT_SECRET)
   throw deny('DGX worker service authentication is not configured',503);
  return {authorization:'Bearer '+env.TG_DGX_JOB_TOKEN,'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET,'content-type':'application/json'};
 };
 const call=async(path,{method='GET',body}={})=>{
  const headers=getAuth();let response;
  try{response=await fetchImpl(EXPECTED_DGX_ORIGIN+path,{method,headers,
   body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(12000)})}
  catch{throw deny('DGX worker unreachable',502)}
  if(!response.ok)throw deny('DGX worker rejected request (HTTP '+response.status+')',502);
  if(!(response.headers.get('content-type')||'').includes('application/json'))throw deny('DGX worker returned unexpected response',502);
  const payload=await response.json();
  if(payload?.ok!==true)throw deny('DGX worker did not confirm request',502);
  return payload;
 };
 return {
  healthWorker:()=>call('/health'),
  dispatchWorker:plan=>call('/jobs',{method:'POST',body:plan}),
  lookupWorkerJob:id=>call('/jobs/'+encodeURIComponent(id)),
  cancelWorkerJob:id=>call('/jobs/'+encodeURIComponent(id)+'/cancel',{method:'POST'})
 };
}
/** Site credentials stay in a secret environment variable, never campaign drafts. */
export function makeSiteCredentialsResolver(env=process.env){
 return siteUrl=>{
  let map;
  try{map=JSON.parse(env.TG_SITE_PROOFS_JSON||'{}')}catch{return null}
  const hostname=new URL(siteUrl).hostname;
  const token=map[hostname];
  return TOKEN_PATTERN.test(token??'')?{verificationToken:token,verificationMethod:'dns_txt'}:null;
 };
}


/** Same-host DGX adapter avoids an unnecessary public Cloudflare round-trip. */
export function makeLoopbackDgxAdapter({env=process.env,fetchImpl=fetch}={}){
 const rawPort=env.TG_WORKER_PORT||'18743',port=Number(rawPort);
 if(!Number.isInteger(port)||port<1024||port>65535)throw deny('Invalid loopback worker port',503);
 const base='http://127.0.0.1:'+port;
 const auth=()=>{
  if(!env.TG_DGX_JOB_TOKEN||env.TG_DGX_JOB_TOKEN.length<32)throw deny('Local worker authentication not configured',503);
  return {'authorization':'Bearer '+env.TG_DGX_JOB_TOKEN,'content-type':'application/json','accept':'application/json'};
 };
 const call=async(path,{method='GET',body}={})=>{
  if(path!=='/health'&&!/^\/jobs(?:\/[a-f0-9-]{36}(?:\/cancel)?)?$/.test(path))throw deny('Unapproved worker route',400);
  const headers=auth();let res;
  try{res=await fetchImpl(base+path,{method,headers,body:body?JSON.stringify(body):undefined,
   redirect:'manual',signal:AbortSignal.timeout(10000)})}
  catch{throw deny('Local DGX worker unavailable',502)}
  if(res.status>=300&&res.status<400)throw deny('Worker redirect forbidden',502);
  if(!(res.headers.get('content-type')||'').includes('application/json'))throw deny('Worker returned unexpected content',502);
  const length=Number(res.headers.get('content-length')||0);
  if(length>2*1024*1024)throw deny('Worker response too large',502);
  let payload;try{payload=await res.json()}catch{throw deny('Worker returned invalid JSON',502)}
  if(!res.ok)throw deny(String(payload?.error||'Worker request failed').slice(0,150),res.status>=400&&res.status<500?res.status:502);
  if(payload?.ok!==true)throw deny('Worker response did not confirm operation',502);
  return payload;
 };
 return {
  healthWorker:()=>call('/health'),
  dispatchWorker:plan=>call('/jobs',{method:'POST',body:plan}),
  lookupWorkerJob:id=>call('/jobs/'+encodeURIComponent(id)),
  cancelWorkerJob:id=>call('/jobs/'+encodeURIComponent(id)+'/cancel',{method:'POST'})
 };
}
