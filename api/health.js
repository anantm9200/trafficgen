import {reply} from '../src/http.mjs';
export default function handler(req,res){
 if(req.method!=='GET')return reply(res,405,{ok:false,error:'Method not allowed'});
 reply(res,200,{ok:true,service:'VisitorLab TrafficGen API',version:'1.0.0',
  mode:'authorized-synthetic-testing',controlPlane:'vercel',browserExecution:'github-actions',
  security:{authConfigured:Boolean(process.env.TG_API_KEY),workflowConfigured:Boolean(process.env.GITHUB_WORKFLOW_TOKEN),
  ga4Configured:Boolean(process.env.GA4_MEASUREMENT_ID&&process.env.GA4_API_SECRET)},
  routes:['POST /api/validate','POST /api/dispatch','GET /api/runs','POST /api/ga4-test','GET /api/spec']});
}
