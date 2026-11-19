import {normalizePlan} from './plan.mjs';
import {normalizeJourneyPlan} from './worker-journey-plan.mjs';
/** Must run at both the public API and DGX queue, never silently drop journey steps. */
export function normalizeForDgx(raw){
 let plan;
 try{plan=normalizeJourneyPlan(raw,normalizePlan)}
 catch(e){if(!Number.isInteger(e?.status))e.status=400;throw e;}
 if(plan.concurrency!==1)throw Object.assign(new Error('DGX currently permits concurrency=1'),{status:400});
 if(plan.analytics.enabled)throw Object.assign(new Error('Production GA4 ingestion is disabled for synthetic tests'),{status:400});
 return plan;
}
