import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parseTarget, error } from './plan.mjs';

export function isPublicIp(ip){
 const kind=isIP(ip);
 if(kind===4){
  const n=ip.split('.').map(Number),[a,b,c]=n;
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===192&&b===0&&c===0||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
 }
 // Only global IPv6 unicast (2000::/3); reject local, IPv4-mapped and link-local.
 if(kind===6)return /^[23][0-9a-f]{3}:/i.test(ip);
 return false;
}
export async function assertPublicDns(host){
 const addresses=await lookup(host,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(x=>!isPublicIp(x.address)))throw error('Hostname did not resolve exclusively to public IP addresses',403);
 return addresses.map(x=>x.address);
}
export async function verifyOwnership(rawUrl,token,{fetchImpl=fetch,dnsCheck=assertPublicDns}={}){
 const target=parseTarget(rawUrl);
 if(!/^tg_[A-Za-z0-9_-]{16,100}$/.test(token??''))throw error('Invalid verification token');
 await dnsCheck(target.hostname);
 const proof=new URL('/.well-known/visitorlab-verify.txt',target.origin);
 const response=await fetchImpl(proof.toString(),{
  method:'GET',redirect:'manual',
  headers:{'accept':'text/plain','user-agent':'VisitorLab-OwnerVerification/1.0'},
  signal:AbortSignal.timeout(7000)
 });
 if(response.status!==200)throw error('Owner verification file must return HTTP 200 (without redirects)',403);
 const size=Number(response.headers.get('content-length')||0);
 if(size>512)throw error('Owner verification file too large',403);
 const text=await response.text();
 if(text.length>512||text.trim()!==token)throw error('Owner verification token did not match',403);
 return {verified:true,hostname:target.hostname,checkedAt:new Date().toISOString()};
}
