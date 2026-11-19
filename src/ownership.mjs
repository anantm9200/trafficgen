import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {parseTarget,error} from './plan.mjs';
export function isPublicIp(ip){
 const family=isIP(ip);
 if(family===4){
  const [a,b,c]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
    a===192&&b===168||a===100&&b>=64&&b<=127||
    a===192&&b===0||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
 }
 if(family===6)return /^[23][0-9a-f]{3}:/i.test(ip);
 return false;
}
export async function assertPublicDns(host){
 const addresses=await lookup(host,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(x=>!isPublicIp(x.address)))throw error('Hostname did not resolve exclusively to public IP addresses',403);
 return addresses.map(x=>x.address);
}
function pinnedProof(target,ip){
 return new Promise((resolve,reject)=>{
  const req=httpsRequest({protocol:'https:',hostname:target.hostname,port:443,
   path:'/.well-known/visitorlab-verify.txt',method:'GET',
   headers:{'accept':'text/plain','user-agent':'VisitorLab-OwnerVerification/1.0'},
   lookup:(_hostname,_options,cb)=>cb(null,ip,isIP(ip)),
   timeout:7000,maxHeaderSize:4096,rejectUnauthorized:true},res=>{
   if(res.statusCode!==200){res.destroy();return reject(error('Owner verification file must return HTTP 200 without redirect',403))}
   const claimed=Number(res.headers['content-length']||0);
   if(claimed>512){res.destroy();return reject(error('Owner verification file too large',403))}
   let total=0,chunks=[];
   res.on('data',chunk=>{total+=chunk.length;if(total>512){res.destroy(error('Owner verification file too large',403));return}chunks.push(chunk)});
   res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
   res.on('error',reject);
  });
  req.on('timeout',()=>req.destroy(error('Ownership proof timeout',408)));
  req.on('error',reject);req.end();
 });
}
export async function verifyOwnership(rawUrl,token,{fetchImpl=null,dnsCheck=assertPublicDns,method='dns_txt'}={}){
 if(method==='dns_txt'&&!fetchImpl){const {verifyDnsOwnership}=await import('./dns-proof.mjs');return verifyDnsOwnership(rawUrl,token,{dnsCheck})}
 if(method!=='http_file'&&!fetchImpl)throw error('Unknown ownership verification method',400);
 const target=parseTarget(rawUrl);
 if(!/^tg_[A-Za-z0-9_-]{16,100}$/.test(token??''))throw error('Invalid verification token');
 const ips=await dnsCheck(target.hostname);
 let content;
 if(fetchImpl){
  const proof=new URL('/.well-known/visitorlab-verify.txt',target.origin);
  const response=await fetchImpl(proof.toString(),{method:'GET',redirect:'manual',headers:{'accept':'text/plain','user-agent':'VisitorLab-OwnerVerification/1.0'},signal:AbortSignal.timeout(7000)});
  if(response.status!==200)throw error('Owner verification file must return HTTP 200 (without redirects)',403);
  if(Number(response.headers.get('content-length')||0)>512)throw error('Owner verification file too large',403);
  content=await response.text();
 }else{
  if(!Array.isArray(ips)||!ips.length)throw error('No public DNS records found',403);
  content=await pinnedProof(target,ips[0]);
 }
 if(content.length>512||content.trim()!==token)throw error('Owner verification token did not match',403);
 return {verified:true,hostname:target.hostname,checkedAt:new Date().toISOString()};
}
