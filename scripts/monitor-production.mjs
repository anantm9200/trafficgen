import { Script } from 'node:vm';

const hosts=['https://trafficgen.vercel.app','https://trafficgen-ua6y.vercel.app'];
const requiredControls=['view-overview','view-builder','view-campaigns','view-runs','view-analytics',
 'view-websites','view-devices','view-settings','review-verify','review-audit','site-domain','site-verify','plan-site-select',
 'review-dispatch','inspection-list','restore-workspace'];
const results=[];
async function request(url){
 const started=Date.now();
 const response=await fetch(url,{
  redirect:'manual',headers:{'user-agent':'TrafficGen-AuthorizedHourlyHealth/1.0'},
  signal:AbortSignal.timeout(15000)
 });
 const text=await response.text();
 return {status:response.status,text,type:response.headers.get('content-type')||'',
  durationMs:Date.now()-started};
}
for(const host of hosts){
 const record={host,checks:[],ok:true};
 const check=(name,pass,detail='')=>{record.checks.push({name,pass,detail});if(!pass)record.ok=false;};
 try{
  const [html,css,js,health,spec,protectedEndpoint]=await Promise.all([
   request(host+'/'),request(host+'/styles.css'),request(host+'/app.js'),
   request(host+'/api/health'),request(host+'/api/spec'),
   request(host+'/api/auth-check')
  ]);
  check('homepage',html.status===200&&html.type.includes('text/html')&&html.text.includes('src="/app.js"'),String(html.status));
  check('all critical dashboard controls',requiredControls.every(id=>html.text.includes('id="'+id+'"')),
   requiredControls.filter(id=>!html.text.includes('id="'+id+'"')).join(','));
  check('CSS asset',css.status===200&&css.type.includes('text/css')&&css.text.length>15000,String(css.status));
  check('JavaScript asset',js.status===200&&js.type.includes('javascript')&&js.text.length>20000,String(js.status));
  let syntax=false;
  try{new Script(js.text,{filename:'app.js'});syntax=true;}catch(e){check('JavaScript syntax',false,String(e.message));}
  if(syntax)check('JavaScript syntax',true);
  let h=null,api=null;
  try{h=JSON.parse(health.text);}catch{}
  try{api=JSON.parse(spec.text);}catch{}
  check('health API',health.status===200&&h?.ok===true&&h?.security?.authConfigured===true,String(health.status));
  check('profile/specification API',spec.status===200&&api?.ok===true&&Array.isArray(api?.browsers)&&api?.inspection?.endpoint==='POST /api/inspect'&&api?.siteVerify?.endpoint==='POST /api/site-verify'&&api?.siteVerify?.requiresAuthentication===false&&api?.dnsStatus?.requiresAuthentication===false,String(spec.status));
  check('protected endpoint denies anonymous use',protectedEndpoint.status===401,String(protectedEndpoint.status));
  record.latencyMs=Math.round((html.durationMs+css.durationMs+js.durationMs+health.durationMs+spec.durationMs)/5);
 }catch(e){check('network',false,String(e.message));}
 results.push(record);
 console.log(JSON.stringify(record,null,2));
}
if(results.some(r=>!r.ok))process.exitCode=1;
