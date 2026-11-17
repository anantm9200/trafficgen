import {Script} from 'node:vm';
const urls=['https://trafficgen.vercel.app','https://trafficgen-ua6y.vercel.app'];
let failed=false;
async function get(url){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});return{status:r.status,body:await r.text(),type:r.headers.get('content-type')};}
for(const base of urls){try{
 const home=await get(base+'/');
 console.log('HOMEPAGE',base,home.status,home.type);
 if(home.status===200){
  if(!home.body.includes('id="view-overview"')||!home.body.includes('/app.js')){console.error('Dashboard markup missing');failed=true;}
  const script=await get(base+'/app.js');
  if(script.status!==200){console.error('Frontend script not served',script.status);failed=true;}
  else try{new Script(script.body,{filename:'app.js'});console.log('JS SYNTAX PASS')}catch(e){console.error('JS SYNTAX FAIL',e.message);failed=true;}
  const h=await get(base+'/api/health');
  if(h.status!==200||!JSON.parse(h.body).ok){console.error('API health failure');failed=true;}
 } else if([401,403,307,308].includes(home.status)){
  console.warn('Protected deployment - automated public probing limited by Vercel Authentication');
 }else{
  console.warn('Unexpected host response',base,home.status);
  if(base===urls[0])failed=true;
 }
}catch(e){console.warn('Probe request failed:',base,String(e.message));if(base===urls[0])failed=true;}
}
if(failed)process.exitCode=1;
