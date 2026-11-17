import {normalizePlan} from '../src/plan.mjs';
import {submitGA4} from '../src/ga4.mjs';
import {apiAuth,onlyMethod,jsonBody,reply,handle} from '../src/http.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 onlyMethod(req,'POST');apiAuth(req);
 const plan=normalizePlan(jsonBody(req));
 if(!plan.analytics.enabled)throw Object.assign(new Error('Set analytics.enabled:true'),{status:400});
 const session={index:1,durationMs:500,countryCode:plan.countries[0],device:plan.devices[0],status:200,pages:[],jsErrors:[],ok:true};
 const result=await submitGA4(plan,session,{debug:true});
 reply(res,200,{ok:true,debug:true,requestSent:result.sent,result,
  note:'Debug endpoint validates event format; it does not create a normal GA4 report event.'});
});}
