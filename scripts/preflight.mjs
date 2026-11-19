import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

/** Offline, non-invasive preflight. Never emits environment variable values. */
const needed=['src/campaign-api.mjs','src/campaign-controller.mjs','src/run-reconciliation.mjs',
 'src/ga4-stream-proof.mjs','src/qa-analytics.mjs','worker/dgx-queue.mjs','worker/run.mjs',
 'api/campaign-gateway.js','command-center/app.js','command-center/styles.css','command-center/index.html',
 'tests/ga4-property-isolation.test.mjs','tests/ga4-batch-efficiency.test.mjs'];
export function releasePreflight({root=process.cwd(),env=process.env}={}){
 const has=k=>typeof env[k]==='string'&&env[k].length>0;
 const workerReady=has('TG_DGX_JOB_TOKEN')&&env.TG_DGX_JOB_TOKEN.length>=32;
 const campaignReady=has('TG_CAMPAIGN_SERVICE_TOKEN')&&env.TG_CAMPAIGN_SERVICE_TOKEN.length>=32&&has('TG_API_KEY')&&env.TG_API_KEY.length>=24;
 const tunnelReady=env.DGX_API_URL==='https://trafficgen-dgx-spark.iagatlas.com'&&
  has('CF_ACCESS_CLIENT_ID')&&has('CF_ACCESS_CLIENT_SECRET')&&workerReady;
 const ga4QAReady=has('GA4_QA_MEASUREMENT_ID')&&has('GA4_PRODUCTION_MEASUREMENT_ID')&&
  has('GA4_QA_API_SECRET')&&has('GA4_QA_PROPERTY_ID')&&
  has('GA4_QA_SA_EMAIL')&&has('GA4_QA_SA_PRIVATE_KEY')&&
  env.GA4_QA_MEASUREMENT_ID!==env.GA4_PRODUCTION_MEASUREMENT_ID;
 const checks={sourceFilesPresent:needed.every(f=>existsSync(resolve(root,f))),
  dgxWorkerServiceConfigured:workerReady,campaignServiceConfigured:campaignReady,
  vercelTunnelConfigured:tunnelReady,ga4QAPropertyConfigured:ga4QAReady,
  scheduledTestsEnabled:env.TG_SCHEDULER_ENABLED==='1',
  sensitiveDataExposed:false};
 return {release:'TrafficGen release candidate',checks,
  localSourceReady:checks.sourceFilesPresent,
  liveReady:checks.sourceFilesPresent&&workerReady&&campaignReady&&tunnelReady&&ga4QAReady,
  note:'Presence checks only; do not prove authentication, tunnel connectivity, DGX execution or GA4 event reporting.'};
}
if(process.argv[1]&&import.meta.url==='file://'+resolve(process.argv[1])){
 console.log(JSON.stringify(releasePreflight(),null,2));
}
