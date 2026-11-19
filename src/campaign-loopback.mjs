import {request as httpRequest} from 'node:http';
import {allowCampaignRoute} from './campaign-routes.mjs';
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
const MAX_BODY=16384,MAX_RESPONSE=2*1024*1024;
export async function relayCampaignToLoopback(route,{method='GET',body,port=18745,token=process.env.TG_CAMPAIGN_SERVICE_TOKEN}={}){
 if(!allowCampaignRoute(route,method))throw fail('Unsupported campaign API route',404);
 if(!Number.isInteger(port)||port<1024||port>65535)throw fail('Campaign loopback port is invalid',503);
 if(typeof token!=='string'||token.length<32)throw fail('Campaign loopback authentication is not configured',503);
 const payload=body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body));
 if(payload!==undefined&&Buffer.byteLength(payload)>MAX_BODY)throw fail('Request body too large',413);
 return await new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port,path:'/api/'+route,method,
   headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:route==='runs.csv'?'text/csv':'application/json',
    ...(payload!==undefined?{'content-length':Buffer.byteLength(payload)}:{})}},res=>{
   const type=String(res.headers['content-type']||'').toLowerCase();
   if(!type.includes('application/json')&&!(route==='runs.csv'&&type.startsWith('text/csv'))){res.resume();reject(fail('Campaign service returned unexpected content',502));return}
   let size=0,parts=[];
   res.on('data',c=>{size+=c.length;if(size>MAX_RESPONSE){req.destroy();reject(fail('Campaign service response too large',502));return}parts.push(c)});
   res.on('end',()=>resolve({status:res.statusCode,contentType:type.startsWith('text/csv')?'text/csv; charset=utf-8':'application/json; charset=utf-8',body:Buffer.concat(parts)}));
   res.on('error',()=>reject(fail('Campaign service response interrupted',502)));
  });
  req.setTimeout(15000,()=>req.destroy(fail('Campaign service timed out',502)));
  req.on('error',()=>reject(fail('Campaign service unavailable',502)));
  req.end(payload);
 });
}
