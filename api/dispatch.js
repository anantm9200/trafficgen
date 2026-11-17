import {normalizePlan} from '../src/plan.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
import {apiAuth,onlyMethod,jsonBody,reply,handle,gitHubApi} from '../src/http.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 onlyMethod(req,'POST');apiAuth(req);
 const plan=normalizePlan(jsonBody(req));
 const verification=await verifyOwnership(plan.targetUrl,plan.verificationToken,{method:plan.verificationMethod});
 if(plan.analytics.enabled&&(!process.env.GA4_MEASUREMENT_ID||plan.analytics.measurementId!==process.env.GA4_MEASUREMENT_ID))throw Object.assign(new Error('GA4 measurementId must match configured GA4_MEASUREMENT_ID'),{status:400});
 const b64=Buffer.from(JSON.stringify(plan)).toString('base64url');
 await gitHubApi('actions/workflows/traffic-test.yml/dispatches',{method:'POST',body:{ref:'main',inputs:{plan_b64:b64}}});
 reply(res,202,{ok:true,dispatched:true,runId:plan.runId,target:verification.hostname,
  status:'queued',execution:'github-actions',
  runsEndpoint:'/api/runs',note:'GitHub returns no workflow-run ID for dispatch; list recent runs to follow execution'});
});}
