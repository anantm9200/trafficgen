import {validateCampaignDraft} from './campaign-definition.mjs';

/**
 * Validate explicit campaign journeys at every trust boundary (API, queue, runner).
 * Existing plans without explicit journeys remain valid legacy observation tests.
 * No fallback to automatic navigation is permitted if a journey was requested.
 */
export function validateWorkerJourney(raw,plan){
 if(raw?.requestedJourney===undefined){
  if(raw?.journeyExecutionMode==='explicit-safe-steps')throw new Error('Explicit journey steps missing');
  return null;
 }
 if(raw?.journeyExecutionMode!=='explicit-safe-steps')throw new Error('Explicit journey protocol required');
 if(raw?.analytics?.enabled===true||plan?.analytics?.enabled===true)throw new Error('Production GA4 ingestion disabled');
 if(!plan?.targetUrl||raw?.targetUrl!==plan.targetUrl)throw new Error('Journey target does not match normalized plan');
 const url=new URL(plan.targetUrl),origin=url.origin;
 const draft=validateCampaignDraft({siteUrl:origin,journey:raw.requestedJourney,
  sessions:plan.sessions,concurrency:plan.concurrency,intervalSeconds:plan.intervalSeconds,
  devices:plan.devices,regions:plan.countries});
 const landing=new URL(draft.journey[0].path,origin);
 if(landing.href!==url.href)throw new Error('First journey navigation must match verified target');
 const navigationCount=draft.journey.filter(s=>s.action==='navigate').length;
 if(navigationCount>plan.maxPages)throw new Error('Journey exceeds normalized page limit');
 return draft.journey;
}
/** Keep the sanitized explicit journey when passing through the API and DGX queue. */
export function normalizeJourneyPlan(raw,normalizePlan){
 const plan=normalizePlan(raw);
 const steps=validateWorkerJourney(raw,plan);
 if(steps)return {...plan,requestedJourney:steps,journeyExecutionMode:'explicit-safe-steps'};
 return plan;
}
