import {randomUUID} from 'node:crypto';
import {compileBrowserPlan,nextCampaignTick} from './campaign-definition.mjs';

const problem=(message,status=400)=>Object.assign(new Error(message),{status});
/**
 * The controller delegates both proof verification and real job dispatch to trusted
 * adapters. A nonexistent adapter is NOT treated as success. No proof tokens stored.
 */
export class CampaignController{
 constructor({store,verifySite,dispatchWorker,siteCredentials}={}){
  if(!store||typeof verifySite!=='function'||typeof dispatchWorker!=='function')throw new Error('Store, site verification and dispatch adapters required');
  this.store=store;this.verifySite=verifySite;this.dispatchWorker=dispatchWorker;
  this.siteCredentials=siteCredentials??(()=>null);
 }
 async launch(campaignId,{verificationToken,verificationMethod='dns_txt',idempotencyKey=randomUUID(),scheduled=false,now=Date.now()}={}){
  const c=this.store.get(campaignId);
  if(!c)throw problem('Campaign not found',404);
  if(c.status!=='active')throw problem('Campaign is not active',409);
  if(c.draft.analyticsMode==='isolated-qa')throw problem('Isolated GA4 QA requires a separate verified destination and is not yet enabled for worker dispatch',409);
  // Must revalidate a live ownership proof on EVERY dispatch, including scheduled ticks.
  if(typeof verificationToken!=='string'||!/^tg_[a-zA-Z0-9_-]{16,100}$/.test(verificationToken))throw problem('Website proof token required',403);
  const proof=await this.verifySite(c.draft.siteUrl,verificationToken,{method:verificationMethod});
  if(proof?.verified!==true)throw problem('Website ownership proof could not be confirmed',403);
  const {run,replayed}=this.store.reserveRun(campaignId,{idempotencyKey,scheduled,now});
  if(replayed)return {run,replayed};
  let plan;
  try{
   plan=compileBrowserPlan(c.draft,{verificationToken,verificationMethod,runId:run.id});
   // Worker independently validates plan and website ownership.
   const result=await this.dispatchWorker(plan);
   if(!result?.ok||typeof result.job?.id!=='string')throw new Error('Browser worker did not acknowledge job');
   return {run:this.store.updateRun(run.id,'queued',{workerJobId:result.job.id}),replayed:false};
  }catch(e){this.store.updateRun(run.id,'failed',{error:'Worker dispatch failed'});throw problem('Verified browser dispatch failed',502)}
 }
 /** One due campaign at a time, bounded work and no missed-run backfills. */
 async scheduledTick({now=Date.now(),maxLaunches=1}={}){
  const outcome=[];let launched=0;
  for(const c of this.store.list()){
   if(c.status!=='active'||c.draft.schedule.type!=='recurring')continue;
   const credentials=await this.siteCredentials(c.draft.siteUrl);
   if(!credentials?.verificationToken){outcome.push({campaignId:c.id,status:'skipped',reason:'missing_verification_credential'});continue}
   const day=this.store.runs(c.id,{limit:100}).filter(r=>r.createdAt.startsWith(new Date(now).toISOString().slice(0,10))&&r.status!=='cancelled');
   const due=nextCampaignTick(c.draft,{now,lastRunAt:c.lastDispatchedAt,completedSessionsToday:day.reduce((n,r)=>n+r.sessionBudget,0)});
   if(!due.due)continue;
   if(launched>=maxLaunches)break;
   // No backfill: tick identifier is stable for this schedule window; store adds a second idempotency gate.
   const tickNumber=Math.floor(now/(c.draft.schedule.everyMinutes*60000));
   const idempotencyKey='schedule_'+c.id.slice(0,8)+'_'+tickNumber;
   try{
    const dispatch=await this.launch(c.id,{...credentials,idempotencyKey,scheduled:true,now});
    outcome.push({campaignId:c.id,status:'dispatched',runId:dispatch.run.id});launched++;
   }catch(e){outcome.push({campaignId:c.id,status:'failed',reason:String(e.message).slice(0,120)})}
  }
  return outcome;
 }
}
