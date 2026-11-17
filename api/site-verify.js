import { parseTarget, error } from '../src/plan.mjs';
import { verifyDnsOwnership,dnsProofRecord } from '../src/dns-proof.mjs';
import { assertPublicDns } from '../src/ownership.mjs';
import { pinnedFetchPage } from '../src/inspection.mjs';
import { detectGoogleTags } from '../src/ga4-detect.mjs';
import { apiAuth,onlyMethod,jsonBody,reply,handle } from '../src/http.mjs';

export default async function handler(req,res){await handle(res,async()=>{
 onlyMethod(req,'POST');apiAuth(req);
 const input=jsonBody(req);
 if(input.authorized!==true)throw error('Confirm ownership or written authorization for this website',403);
 const record=dnsProofRecord(input.targetUrl,input.verificationToken);
 const verification=await verifyDnsOwnership(input.targetUrl,input.verificationToken);
 // DNS ownership is already verified. GA4 detection is best effort and
 // must not invalidate an otherwise successful domain enrollment.
 let ga4;
 try{
  const target=parseTarget(input.targetUrl),ips=await assertPublicDns(target.hostname);
  const page=await pinnedFetchPage(new URL(target.origin+'/'),ips[0]);
  if(page.status>=300&&page.status<400)throw Error('Homepage redirects. Detection skipped; the domain is still verified.');
  if(!String(page.headers['content-type']||'').toLowerCase().includes('html'))throw Error('Homepage response is not HTML');
  ga4=detectGoogleTags(page.body);
  ga4.pageStatus=page.status;
 }catch(e){ga4={status:'inspection_unavailable',measurementIds:[],tagManagerIds:[],method:'static_html',trackingActiveConfirmed:false,note:String(e.message||'Could not inspect website').slice(0,180)};}
 reply(res,200,{ok:true,verified:true,verification,ga4,recordName:record.name});
});}
