import { resolveTxt } from 'node:dns/promises';
import { parseTarget, error } from '../src/plan.mjs';
import { DNS_PROOF_PREFIX, DNS_PROOF_MARKER, flattenTxtRecords } from '../src/dns-proof.mjs';
import { onlyMethod, reply, handle } from '../src/http.mjs';

// Read-only public DNS diagnostics; never returns the TXT verification
// token, and never makes a request to the target website.
export async function checkTxtStatus(hostname,{lookup=resolveTxt}={}){
 if(typeof hostname!=='string'||hostname.length>253)throw error('Invalid hostname');
 const host=parseTarget('https://'+hostname).hostname;
 const name=DNS_PROOF_PREFIX+'.'+host;
 let records=[];
 try{records=flattenTxtRecords(await lookup(name));}
 catch(e){
  if(['ENODATA','ENOTFOUND','ENODOMAIN'].includes(e?.code))return{host,recordName:name,
   recordPresent:false,status:'not_published',checkedAt:new Date().toISOString()};
  throw error('Public DNS resolver is temporarily unavailable; retry the check.',503);
 }
 const count=records.filter(x=>x.startsWith(DNS_PROOF_MARKER)).length;
 return{host,recordName:name,recordPresent:count>0,verificationRecordCount:count,
  status:count?'published':'no_visitorlab_record',checkedAt:new Date().toISOString()};
}
export default async function handler(req,res){
 await handle(res,async()=>{
  onlyMethod(req,'GET');
  const hostname=req.query?.hostname;
  if(typeof hostname!=='string')throw error('hostname query parameter is required');
  reply(res,200,{ok:true,dns:await checkTxtStatus(hostname)});
 });
}
