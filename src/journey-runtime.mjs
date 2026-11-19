import {performance} from 'node:perf_hooks';
import {delay} from './execution-engine.mjs';
import {validateCampaignDraft} from './campaign-definition.mjs';
/** Explicit, non-mutating journeys for owned websites. */
export async function executeSafeJourney(page,campaign,{signal,sleep=delay,navigateUrl=url=>url,onNavigation=()=>{}}={}){
 const c=validateCampaignDraft(campaign),events=[];
 if(!page||typeof page.goto!=='function')throw new Error('Browser page required');
 let visited=0,started=performance.now();
 for(const [i,step] of c.journey.entries()){
  if(signal?.aborted)throw Object.assign(new Error('Journey cancelled'),{name:'AbortError'});
  const t=performance.now();let outcome;
  try{
   if(step.action==='navigate'){
    const url=navigateUrl(c.siteUrl+step.path);
    if(new URL(url).origin!==c.siteUrl)throw new Error('Navigation target left the verified origin');
    const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    const status=r?.status?.()??0;
    const finalUrl=page.url();
    if(new URL(finalUrl).origin!==c.siteUrl)throw new Error('Journey redirected out of scope');
    onNavigation({url:finalUrl,status,durationMs:Math.round(performance.now()-t)});
    if(status<200||status>=400)throw new Error('HTTP '+status);
    visited++;outcome={status,path:step.path};
   }else if(step.action==='scroll'){
    await page.mouse.wheel(0,step.distancePx);outcome={distancePx:step.distancePx};
   }else if(step.action==='dwell'){
    await sleep(step.seconds*1000,signal);outcome={seconds:step.seconds};
   }else if(step.action==='assert'){
    // Assertions must not interact with forms or mutate website data.
    const visible=await page.locator(step.selector).isVisible({timeout:3000});
    if(!visible)throw new Error('Expected element not visible');
    outcome={visible:true};
   }
   events.push({step:i+1,action:step.action,ok:true,durationMs:Math.round(performance.now()-t),...outcome});
  }catch(error){
   events.push({step:i+1,action:step.action,ok:false,error:String(error?.message||error).slice(0,180)});
   break;
  }
 }
 return {ok:events.length===c.journey.length&&events.every(e=>e.ok),steps:events,visitedPages:visited,
  durationMs:Math.round(performance.now()-started),synthetic:true};
}
