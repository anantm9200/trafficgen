import { normalizePlan } from '../src/plan.mjs';
import { verifyOwnership } from '../src/ownership.mjs';
import { inspectVerifiedPage } from '../src/inspection.mjs';
import { apiAuth, onlyMethod, jsonBody, reply, handle } from '../src/http.mjs';

export default async function handler(req,res){
 await handle(res,async()=>{
  onlyMethod(req,'POST');
  apiAuth(req);
  const plan=normalizePlan(jsonBody(req));
  const audit=await inspectVerifiedPage(plan,{verify:verifyOwnership});
  reply(res,200,{ok:true,audit,notes:[
   'One verified, tagged server-side HTTP request. This is not a full browser test.',
   'The output contains observed metadata and heuristic warnings, not Google indexing statistics.'
  ]});
 });
}
