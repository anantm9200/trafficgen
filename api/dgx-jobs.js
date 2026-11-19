// Production wiring patch: Vercel API preserves explicit journey steps before forwarding to DGX.
import {apiAuth,handle,onlyMethod,jsonBody,reply} from '../src/http.mjs';
import {normalizeForDgx} from '../src/dispatch-bridge.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
import {dgxRequest} from '../src/dgx-client.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 apiAuth(req);
 if(req.method==='GET')return reply(res,200,await dgxRequest('/jobs'));
 onlyMethod(req,'POST');
 const plan=normalizeForDgx(jsonBody(req));
 await verifyOwnership(plan.targetUrl,plan.verificationToken,{method:plan.verificationMethod});
 return reply(res,202,await dgxRequest('/jobs',{method:'POST',body:plan}));
});}
