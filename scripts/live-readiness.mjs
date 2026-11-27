import {pathToFileURL} from 'node:url';
/** Optional, read-only integration probe to execute on an authorized deployment host.
 * Never dispatches browser jobs, sends GA4 events, or prints credential values.
 */
import {releasePreflight} from './preflight.mjs';
import {checkDgxHealth} from '../src/dgx-client.mjs';
import {relayCampaignViaDgx} from '../src/campaign-gateway.mjs';
import {verifyIsolatedQAStream} from '../src/ga4-stream-proof.mjs';

export async function checkLiveReadiness({env=process.env}={}){
 const local=releasePreflight({env});
 const status={sourceReady:local.localSourceReady,workerHealth:'not_checked',campaignService:'not_checked',qaStream:'not_checked'};
 if(local.checks.vercelTunnelConfigured){
  try{
   const worker=await checkDgxHealth({env});
   status.workerHealth=worker?.service==='trafficgen-dgx-worker'?'verified':'rejected';
   const campaign=await relayCampaignViaDgx('qa/health',{env});
   status.campaignService=campaign.status===200&&campaign.data?.ok===true?'verified':'rejected';
  }catch{status.workerHealth=status.workerHealth==='not_checked'?'unavailable':status.workerHealth;
   status.campaignService='unavailable';}
 }
 if(local.checks.ga4QAPropertyConfigured){
  try{
   const proof=await verifyIsolatedQAStream({qaPropertyId:env.GA4_QA_PROPERTY_ID,
    serviceAccountEmail:env.GA4_QA_SA_EMAIL,privateKeyPem:env.GA4_QA_SA_PRIVATE_KEY},
    {qaMeasurementId:env.GA4_QA_MEASUREMENT_ID});
   status.qaStream=proof.verified===true?'verified':'rejected';
  }catch{status.qaStream='unavailable'}
 }
 return {...status,liveValidated:status.workerHealth==='verified'&&status.campaignService==='verified'&&status.qaStream==='verified',
  note:'Read-only connectivity/identity checks only; completed browser journeys and GA4 reporting require separate observed evidence.'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await checkLiveReadiness();console.log(JSON.stringify(result,null,2));
 if(!result.liveValidated)process.exitCode=2;
}
