import {apiAuth,onlyMethod,reply,handle} from '../src/http.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 onlyMethod(req,'GET');apiAuth(req);
 reply(res,200,{ok:true,access:'authorized',integrations:{
  githubWorkflow:Boolean(process.env.GITHUB_WORKFLOW_TOKEN),
  ga4:Boolean(process.env.GA4_MEASUREMENT_ID&&process.env.GA4_API_SECRET),
  dgx:Boolean(process.env.DGX_API_URL&&process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET&&process.env.TG_DGX_JOB_TOKEN)
 }});
});}
