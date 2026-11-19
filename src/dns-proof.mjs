import {resolveTxt} from 'node:dns/promises';
import {parseTarget,error} from './plan.mjs';
import {assertPublicDns} from './ownership.mjs';
export const DNS_PROOF_PREFIX='_visitorlab';
export const DNS_PROOF_MARKER='visitorlab-verification=';
export function dnsProofRecord(rawUrl,token){
 const u=parseTarget(rawUrl);
 if(typeof token!=='string'||!/^tg_[A-Za-z0-9_-]{16,100}$/.test(token))throw error('Invalid site verification token');
 return {name:DNS_PROOF_PREFIX+'.'+u.hostname,type:'TXT',value:DNS_PROOF_MARKER+token,host:u.hostname};
}
export function flattenTxtRecords(records){
 if(!Array.isArray(records))return [];
 return records.slice(0,100).filter(Array.isArray).map(chunks=>chunks.join('').trim().replace(/^"(.*)"$/,'$1')).filter(Boolean);
}
export async function verifyDnsOwnership(rawUrl,token,{txtLookup=resolveTxt,dnsCheck=assertPublicDns}={}){
 const record=dnsProofRecord(rawUrl,token);
 await dnsCheck(record.host);
 let records;
 try{records=flattenTxtRecords(await txtLookup(record.name))}catch(e){
  if(['ENODATA','ENOTFOUND','ENODOMAIN','ESERVFAIL','ETIMEOUT'].includes(e?.code))
   throw error('DNS TXT record not found yet at '+record.name+'. Check the record and retry after DNS propagation.',403);
  throw error('DNS TXT lookup failed. Retry shortly or check your DNS provider.',503);
 }
 if(!records.includes(record.value))throw error('DNS TXT verification value did not match at '+record.name,403);
 return {verified:true,method:'dns_txt',hostname:record.host,recordName:record.name,checkedAt:new Date().toISOString()};
}
