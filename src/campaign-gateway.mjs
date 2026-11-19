import {allowCampaignRoute} from './campaign-routes.mjs';

const APPROVED='https://trafficgen-dgx-spark.iagatlas.com';
const MAX_BODY=16384,MAX_RESPONSE=2*1024*1024;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

export async function relayCampaignViaDgx(route,{method='GET',body,env=process.env,fetchImpl=fetch}={}){
 if(!allowCampaignRoute(route,method))throw fail('Unsupported campaign API route or method',404);
 if(env.DGX_API_URL!==APPROVED)throw fail('Approved DGX gateway is not configured',503);
 if(typeof env.TG_DGX_JOB_TOKEN!=='string'||env.TG_DGX_JOB_TOKEN.length<32||
  !env.CF_ACCESS_CLIENT_ID||!env.CF_ACCESS_CLIENT_SECRET)throw fail('Service authentication is not configured',503);
 const payload=body===undefined?undefined:JSON.stringify(body);
 if(payload!==undefined&&Buffer.byteLength(payload)>MAX_BODY)throw fail('Request body too large',413);
 if(payload!==undefined&&method==='GET')throw fail('GET cannot include a request body');
 let response;
 try{
  response=await fetchImpl(APPROVED+'/campaign-api/'+route,{
   method,redirect:'manual',headers:{'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET,
    authorization:'Bearer '+env.TG_DGX_JOB_TOKEN,
    'content-type':'application/json',accept:route==='runs.csv'?'text/csv':'application/json'},
   body:payload,signal:AbortSignal.timeout(method==='GET'?12000:20000)
  });
 }catch{throw fail('Campaign service connection failed',502)}
 if(response.status>=300&&response.status<400)throw fail('Gateway redirects are forbidden',502);
 const contentType=(response.headers.get('content-type')||'').toLowerCase();
 const isCsv=route==='runs.csv'&&contentType.startsWith('text/csv');
 if(!isCsv&&!contentType.includes('application/json'))throw fail('Campaign service returned unexpected content type',502);
 if(Number(response.headers.get('content-length')||0)>MAX_RESPONSE)throw fail('Campaign response is too large',502);
 // Read the stream with a hard cap, including when Content-Length is absent.
 const reader=response.body?.getReader();let size=0,chunks=[];
 if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>MAX_RESPONSE)throw fail('Campaign response exceeded size limit',502);chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock()}}
 const data=Buffer.concat(chunks).toString('utf8');
 if(isCsv)return {status:response.status,kind:'csv',data};
 let json;try{json=JSON.parse(data)}catch{throw fail('Campaign service returned invalid JSON',502)}
 if(!json||typeof json!=='object'||Array.isArray(json)||typeof json.ok!=='boolean')throw fail('Campaign service response invalid',502);
 if(response.status===404&&json.error==='Not found'&&['campaigns','runs','insights','qa/health','worker-health'].includes(route))
  throw fail('DGX Campaign API route missing. Update the DGX worker and start its loopback Campaign API.',503);
 return {status:response.status,kind:'json',data:json};
}
