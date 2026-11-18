import { request as httpsRequest } from 'node:https';
import { performance } from 'node:perf_hooks';
import { parseTarget, safePath, error } from './plan.mjs';
import { assertPublicDns, isPublicIp } from './ownership.mjs';
import { detectGoogleTags } from './ga4-detect.mjs';

const MAX_BYTES=512*1024;
function decodeEntities(s=''){
 return String(s).replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(m,dec,hex)=>{
  const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
  if(named[m.toLowerCase()])return named[m.toLowerCase()];
  const n=dec?Number(dec):parseInt(hex,16);
  return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):m;
 });
}
function clean(s){return decodeEntities(String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).slice(0,300);}
function attr(tag,name){
 const re=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|'+String.fromCharCode(39)+'([^'+String.fromCharCode(39)+']*)'+String.fromCharCode(39)+'|([^\\s>]+))','i');
 const m=tag.match(re);return m?decodeEntities(m[1]??m[2]??m[3]):'';
}
function meta(tags,key,value){
 const found=tags.find(tag=>attr(tag,key).toLowerCase()===value.toLowerCase());
 return found?attr(found,'content'):'';
}
export function inspectHtml(html,status=200,headers={}){
 const doc=html.slice(0,MAX_BYTES);
 const title=clean(doc.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 const metas=doc.match(/<meta\b[^>]*>/gi)||[];
 const links=doc.match(/<link\b[^>]*>/gi)||[];
 const imageTags=doc.match(/<img\b[^>]*>/gi)||[];
 const h1s=doc.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)||[];
 const description=meta(metas,'name','description').slice(0,300);
 const robots=meta(metas,'name','robots').slice(0,140);
 const viewport=meta(metas,'name','viewport').slice(0,140);
 const canonicalLink=links.find(tag=>attr(tag,'rel').toLowerCase().split(/\s+/).includes('canonical'));
 const canonical=canonicalLink?attr(canonicalLink,'href').slice(0,300):'';
 const ogTitle=meta(metas,'property','og:title').slice(0,200);
 const ldJson=(doc.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/gi)||[]).length;
 const missingAlt=imageTags.filter(tag=>!attr(tag,'alt')).length;
 const observations={
  title,metaDescription:description,canonical,robots,viewport,ogTitle,
  h1Count:h1s.length,h1Examples:h1s.slice(0,3).map(clean),
  images:imageTags.length,imagesWithoutAlt:missingAlt,
  linkCount:(doc.match(/<a\b/gi)||[]).length,
  scripts:(doc.match(/<script\b/gi)||[]).length,structuredDataBlocks:ldJson,
  headers:{
   contentType:String(headers['content-type']||'').slice(0,120),
   cacheControl:String(headers['cache-control']||'').slice(0,150),
   hsts:Boolean(headers['strict-transport-security']),
   frameProtection:Boolean(headers['x-frame-options']||headers['content-security-policy']),
   xContentTypeOptions:Boolean(headers['x-content-type-options'])
  }
 };
 const findings=[];const add=(level,code,message)=>findings.push({level,code,message});
 if(status<200||status>=400)add('high','HTTP_STATUS','Homepage returned HTTP '+status);
 if(!title)add('medium','MISSING_TITLE','Page has no visible HTML title');
 else if(title.length>75)add('low','LONG_TITLE','Page title is longer than 75 characters');
 if(!description)add('medium','MISSING_META_DESCRIPTION','Page has no meta description');
 if(!viewport)add('medium','MISSING_VIEWPORT','Mobile viewport tag is missing');
 if(h1s.length===0)add('medium','MISSING_H1','Page contains no H1 heading');
 if(h1s.length>1)add('low','MULTIPLE_H1','Page contains '+h1s.length+' H1 headings; review heading hierarchy');
 if(missingAlt)add('low','MISSING_IMAGE_ALT',missingAlt+' image(s) have missing or empty alternative text; inspect decorative exceptions');
 if(!canonical)add('info','CANONICAL_NOT_FOUND','Canonical link was not detected; this is optional for some pages');
 if(/noindex/i.test(robots))add('high','NOINDEX','Robots meta directive includes noindex');
 if(!observations.headers.hsts)add('info','NO_HSTS','Strict-Transport-Security header not present');
 return {observations,findings,ga4:detectGoogleTags(doc)};
}
export function pinnedFetchPage(target,ip,{timeoutMs=12000,maxBytes=MAX_BYTES}={}){
 if(!isPublicIp(ip))throw error('Only a verified public IP is allowed',403);
 return new Promise((resolve,reject)=>{
  const started=performance.now();
  const req=httpsRequest({
   protocol:'https:',hostname:target.hostname,servername:target.hostname,
   port:443,path:target.pathname+target.search,method:'GET',
   lookup:(_host,_opts,cb)=>cb(null,ip,ip.includes(':')?6:4),
   timeout:timeoutMs,rejectUnauthorized:true,maxHeaderSize:16384,
   headers:{'Accept':'text/html,application/xhtml+xml;q=0.9','User-Agent':'VisitorLab-AuthorizedSiteInspection/1.0','X-Synthetic-Test':'visitorlab','Cache-Control':'no-cache'}
  },response=>{
   let total=0,done=false;const buffers=[];
   const status=response.statusCode||0,headers=response.headers;
   response.on('data',chunk=>{
    if(done)return;total+=chunk.length;
    if(total>maxBytes){done=true;response.destroy();reject(error('Response exceeded 512 KiB limit',413));return;}
    buffers.push(chunk);
   });
   response.on('end',()=>{if(done)return;done=true;resolve({
    status,headers,body:Buffer.concat(buffers).toString('utf8'),
    durationMs:Math.round(performance.now()-started),bytes:total
   });});
   response.on('error',err=>{if(!done){done=true;reject(err);}});
  });
  req.on('timeout',()=>req.destroy(error('Website inspection timed out',408)));
  req.on('error',reject);req.end();
 });
}
export async function inspectVerifiedPage(plan,{verify,dnsCheck=assertPublicDns,fetchPage=pinnedFetchPage}={}){
 const target=parseTarget(plan.targetUrl);
 if(!safePath(target.href,target.origin))throw error('Unsafe or state-changing page path is not permitted',403);
 if(!verify)throw error('Site verification is required before inspection',403);
 const verification=await verify(plan.targetUrl,plan.verificationToken,{method:plan.verificationMethod||'dns_txt'});
 if(!verification?.verified||verification.hostname!==target.hostname)throw error('Website ownership is not verified',403);
 const ips=await dnsCheck(target.hostname);
 if(!Array.isArray(ips)||ips.length===0||!ips.every(isPublicIp))throw error('No safe public address resolved for target',403);
 let response;const failures=[];
 for(const ip of ips.slice(0,4)){
  try{response=await fetchPage(target,ip);break;}
  catch(e){
   const code=String(e?.code||'');
   failures.push(code==='ETIMEDOUT'||e?.status===408?'timeout':
    ['ECONNRESET','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH'].includes(code)?'connection_failed':
    code.startsWith('ERR_TLS')||code.startsWith('CERT_')?'tls_failed':
    e?.status===413?'response_too_large':'request_failed');
  }
 }
 if(!response){
  const reason=failures.every(x=>x==='timeout')?'timeout':failures.includes('tls_failed')?'tls_failed':failures.includes('connection_failed')?'connection_failed':failures.includes('response_too_large')?'response_too_large':'request_failed';
  throw error('Website inspection could not fetch the verified HTTPS page ('+reason+'). Check the canonical URL, TLS certificate, firewall and server availability.',reason==='response_too_large'?413:424);
 }
 const contentType=String(response.headers['content-type']||'').toLowerCase();
 if(response.status>=300&&response.status<400)throw error('Site returned a redirect; supply the final canonical HTTPS URL',400);
 if(!contentType.includes('text/html')&&!contentType.includes('application/xhtml+xml'))throw error('Target did not return HTML ('+contentType.slice(0,100)+')',400);
 const result=inspectHtml(response.body,response.status,response.headers);
 const ok=response.status>=200&&response.status<400;
 return {
  kind:'site_inspection',runId:plan.runId,mode:'single_verified_http_get',
  target:target.origin+target.pathname,
  timestamp:new Date().toISOString(),
  verified:true,status:response.status,ok,
  durationMs:response.durationMs,bytes:response.bytes,
  ...result,
  notice:'This is one tagged server-side HTTP inspection. It does not run a browser, prove a regional source IP, or create human analytics sessions.'
 };
}
