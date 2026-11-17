import { timingSafeEqual } from 'node:crypto';
import { error } from './plan.mjs';
export function apiAuth(req){
 const key=process.env.TG_API_KEY;
 if(!key||key.length<24)throw error('Server administrator must configure TG_API_KEY (24+ characters)',503);
 const header=req.headers.authorization||'';
 const given=header.startsWith('Bearer ')?header.slice(7):'';
 const a=Buffer.from(given),b=Buffer.from(key);
 if(a.length!==b.length||!timingSafeEqual(a,b))throw error('Unauthorized',401);
}
export function onlyMethod(req,method){if(req.method!==method)throw error('Method not allowed',405);}
export function jsonBody(req){
 const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
 if(Buffer.byteLength(raw)>15000)throw error('Request body too large',413);
 try{return typeof req.body==='object'&&req.body!==null?req.body:JSON.parse(raw);}catch{throw error('Invalid JSON');}
}
export function reply(res,status,object){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.status(status).json(object);
}
export async function handle(res,fn){
 try{await fn();}catch(e){
  const status=Number.isInteger(e.status)?e.status:500;
  // Do not leak raw external API error bodies, secrets, tokens or stack traces.
  reply(res,status,{ok:false,error:status>=500?'Server request failed or integration is not configured':e.message,
   ...(process.env.NODE_ENV==='development'?{detail:String(e.message)}:{})});
 }}
export async function gitHubApi(path,{method='GET',body}={}){
 const token=process.env.GITHUB_WORKFLOW_TOKEN;
 if(!token)throw error('Server requires GITHUB_WORKFLOW_TOKEN to run workflows',503);
 const url='https://api.github.com/repos/anantm9200/trafficgen/'+path;
 const response=await fetch(url,{method,headers:{'authorization':'Bearer '+token,'accept':'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw error('GitHub integration failed (HTTP '+response.status+')',502);
 return response.status===204?null:await response.json();
}
