import {apiAuth,onlyMethod,reply,handle,gitHubApi} from '../src/http.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 onlyMethod(req,'GET');apiAuth(req);
 const data=await gitHubApi('actions/workflows/traffic-test.yml/runs?per_page=20');
 const runs=(data.workflow_runs??[]).map(x=>({id:x.id,status:x.status,conclusion:x.conclusion,
  createdAt:x.created_at,updatedAt:x.updated_at,url:x.html_url,artifactsUrl:x.artifacts_url,
  attempt:x.run_attempt}));
 reply(res,200,{ok:true,runs,report:'Download the visitorlab-report artifact from a completed GitHub Actions run'});
});}
