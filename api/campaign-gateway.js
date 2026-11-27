// Vercel edge of the persistent DGX Campaign Lab API.
import {apiAuth} from '../src/http.mjs';
import {relayCampaignViaDgx} from '../src/campaign-gateway.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  apiAuth(req);
  const route=req.query?.route;
  if(typeof route!=='string')throw Object.assign(new Error('Invalid campaign route'),{status:400});
  const result=await relayCampaignViaDgx(route,{method:req.method,body:req.body});
  res.status(result.status);
  if(result.kind==='csv'){
   res.setHeader('Content-Type','text/csv; charset=utf-8');
   res.setHeader('Content-Disposition','attachment; filename="trafficgen-synthetic-runs.csv"');
   return res.send(result.data);
  }
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.json(result.data);
 }catch(e){
  const status=Number.isInteger(e.status)&&e.status>=400&&e.status<600?e.status:500;
  return res.status(status).json({ok:false,error:status>=500?'Campaign gateway unavailable':String(e.message).slice(0,140)});
 }
}
