import {normalizePlan,publicPlan} from '../src/plan.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
import {apiAuth,onlyMethod,jsonBody,reply,handle} from '../src/http.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 onlyMethod(req,'POST');apiAuth(req);
 const plan=normalizePlan(jsonBody(req));
 const verification=await verifyOwnership(plan.targetUrl,plan.verificationToken);
 reply(res,200,{ok:true,verification,plan:publicPlan(plan)});
});}
