import { parseTarget, error } from '../src/plan.mjs';
import { verifyDnsOwnership, dnsProofRecord } from '../src/dns-proof.mjs';
import { assertPublicDns } from '../src/ownership.mjs';
import { pinnedFetchPage } from '../src/inspection.mjs';
import { detectGoogleTags } from '../src/ga4-detect.mjs';
import { onlyMethod, jsonBody, reply, handle } from '../src/http.mjs';

// No bearer key is required for initial enrollment: the public DNS proof
// is checked before any bounded webpage fetch. Privileged campaign
// dispatch, inspection, run access and GA4 event submissions remain private.
// This is basic best-effort per-instance throttling; production-scale limits
// should also be configured with a shared store/WAF.
const recentChecks=new Map();
function checkRateLimit(hostname){
 const now=Date.now();
 if(recentChecks.size>1024){
  for(const [key,until] of recentChecks)if(until<=now)recentChecks.delete(key);
  if(recentChecks.size>1024)recentChecks.clear();
 }
 const until=recentChecks.get(hostname)||0;
 if(until>now)throw error('Verification was just checked. Retry in '+Math.ceil((until-now)/1000)+' seconds.',429);
 recentChecks.set(hostname,now+8000);
}
export async function verifySiteAndDetect(input,{
 verifyDns=verifyDnsOwnership,dnsCheck=assertPublicDns,
 fetchPage=pinnedFetchPage,detect=detectGoogleTags,throttle=checkRateLimit
}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw error('Invalid verification request');
 if(input.authorized!==true)throw error('Confirm website ownership or written testing authorization first.',403);
 const record=dnsProofRecord(input.targetUrl,input.verificationToken);
 throttle(record.host);
 // Nothing is fetched from the target unless the DNS TXT proof matches.
 const verification=await verifyDns(input.targetUrl,input.verificationToken);
 let ga4;
 try{
  const target=parseTarget(input.targetUrl),ips=await dnsCheck(target.hostname);
  const response=await fetchPage(new URL(target.origin+'/'),ips[0]);
  const mime=String(response.headers?.['content-type']||'').toLowerCase();
  if(response.status>=300&&response.status<400)throw Error('Homepage returned a redirect; GA4 detection skipped');
  if(!mime.includes('html'))throw Error('Homepage did not serve HTML');
  ga4=detect(response.body);
  ga4.pageStatus=response.status;
 }catch(e){
  ga4={status:'inspection_unavailable',measurementIds:[],tagManagerIds:[],
   method:'static_html',trackingActiveConfirmed:false,
   note:'DNS ownership verified. GA4 detection could not complete: '+String(e.message||'page fetch unavailable').slice(0,140)};
 }
 return {ok:true,verified:true,verification,ga4,recordName:record.name,
  note:'DNS ownership verified. Website testing remains subject to API authentication and re-verification.'};
}
export default async function handler(req,res){
 await handle(res,async()=>{
  onlyMethod(req,'POST');
  // Cross-origin browser requests are refused. No Access-Control-Allow-Origin
  // is set; an application-side origin check adds another layer.
  const origin=req.headers?.origin;
  if(origin){
   let parsed;
   try{parsed=new URL(origin);}catch{throw error('Invalid request origin',403);}
   const host=req.headers?.host||'';
   if(parsed.protocol!=='https:'&&parsed.hostname!=='localhost')throw error('Secure request origin required',403);
   if(parsed.host!==host)throw error('Cross-origin website verification is not allowed',403);
  }
  const result=await verifySiteAndDetect(jsonBody(req));
  reply(res,200,result);
 });
}
