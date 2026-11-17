import {apiAuth,handle,onlyMethod,jsonBody,reply} from '../src/http.mjs';
import {normalizePlan} from '../src/plan.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
import {dgxRequest} from '../src/dgx-client.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 apiAuth(req);
 if(req.method==='GET')return reply(res,200,await dgxRequest('/jobs'));
 onlyMethod(req,'POST');
 const plan=normalizePlan(jsonBody(req));
 if(plan.concurrency!==1)throw Object.assign(new Error('DGX permits one concurrent browser'),{status:400});
 if(plan.analytics.enabled)throw Object.assign(new Error('Disable GA4 ingestion for DGX synthetic tests'),{status:400});
 await verifyOwnership(plan.targetUrl,plan.verificationToken,{method:plan.verificationMethod});
 const data=await dgxRequest('/jobs',{method:'POST',body:plan});
 reply(res,202,data);
});}
