import { randomInt } from 'node:crypto';
import { UTM_KEYS, error } from './plan.mjs';

export function buildGA4Event(plan,session,{debug=false}={}){
 const src=plan.analytics?.utm||{};
 const params={
  session_id: Math.floor(Date.now()/1000),
  engagement_time_msec:Math.max(1,Math.min(3600000,session.durationMs||1)),
  traffic_type:'internal',
  debug_mode:debug,
  tg_synthetic:1,
  tg_run_id:plan.runId,
  tg_session_number:session.index||1,
  tg_country_profile:session.countryCode||'',
  tg_device_profile:session.device||'',
  tg_browser:plan.browser,
  tg_page_status:session.status||0,
  tg_page_count:session.pages?.length||0,
  tg_js_error_count:session.jsErrors?.length||0,
  tg_passed:session.ok?1:0
 };
 for(const key of UTM_KEYS)if(src[key])params['tg_'+key]=src[key];
 return {
  client_id:(randomInt(100000000,999999999)+'.'+Math.floor(Date.now()/1000)),
  non_personalized_ads:true,
  events:[{name:'visitorlab_synthetic_visit',params}]
 };
}
export async function submitGA4(plan,session,{measurementId=process.env.GA4_MEASUREMENT_ID,apiSecret=process.env.GA4_API_SECRET,debug=false,fetchImpl=fetch}={}){
 if(!plan.analytics?.enabled)return {sent:false,reason:'disabled'};
 if(!measurementId||!apiSecret)return {sent:false,reason:'missing_GA4_secrets'};
 if(plan.analytics.measurementId!==measurementId)throw error('Configured measurementId does not match the authorized GA4_MEASUREMENT_ID secret',403);
 if(!/^G-[A-Z0-9]{5,20}$/.test(measurementId))throw error('Invalid configured measurement ID');
 const endpoint=new URL(debug?'https://www.google-analytics.com/debug/mp/collect':'https://www.google-analytics.com/mp/collect');
 endpoint.searchParams.set('measurement_id',measurementId);
 endpoint.searchParams.set('api_secret',apiSecret);
 const payload=buildGA4Event(plan,session,{debug});
 const response=await fetchImpl(endpoint.toString(),{
  method:'POST',
  headers:{'content-type':'application/json','user-agent':'VisitorLab-SyntheticTesting/1.0'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(7000)
 });
 const validation=debug?await response.json().catch(()=>null):null;
 return {sent:response.ok,status:response.status,validation,
  note:response.ok?'Google accepted the transport request; event processing and reporting are not guaranteed':'Google rejected the request'};
}
