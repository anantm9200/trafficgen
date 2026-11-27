import {sign} from 'node:crypto';

const encoded=data=>Buffer.from(typeof data==='string'?data:JSON.stringify(data)).toString('base64url');
const refuse=(message,status=503)=>Object.assign(new Error(message),{status});
export function validateGA4ReportingConfig(raw){
 if(!raw||typeof raw!=='object')throw refuse('GA4 QA reporting not configured');
 if(!/^\d{6,15}$/.test(raw.qaPropertyId||''))throw refuse('Valid GA4 QA numeric property ID required');
 if(!/^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(raw.serviceAccountEmail||''))throw refuse('Google service account email required');
 const key=String(raw.privateKeyPem||'').replaceAll('\\n','\n');
 if(!key.includes('-----BEGIN PRIVATE KEY-----')||!key.includes('-----END PRIVATE KEY-----'))throw refuse('Google service account private key required');
 return {...raw,privateKeyPem:key};
}
export function buildServiceAccountAssertion(config,{nowSeconds=Math.floor(Date.now()/1000)}={}){
 const c=validateGA4ReportingConfig(config);
 const head={alg:'RS256',typ:'JWT'};
 const body={iss:c.serviceAccountEmail,scope:'https://www.googleapis.com/auth/analytics.readonly',
  aud:'https://oauth2.googleapis.com/token',iat:nowSeconds,exp:nowSeconds+3300};
 const unsigned=encoded(head)+'.'+encoded(body);
 return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),c.privateKeyPem).toString('base64url');
}
export function buildQAReportQuery(runId){
 if(typeof runId!=='string'||!/^[a-f\d-]{36}$/i.test(runId))throw new Error('Invalid run identifier');
 return {dateRanges:[{startDate:'7daysAgo',endDate:'today'}],
  dimensions:[{name:'eventName'},{name:'customEvent:tg_run_id'}],metrics:[{name:'eventCount'}],
  dimensionFilter:{andGroup:{expressions:[
   {filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'trafficgen_qa_session'}}},
   {filter:{fieldName:'customEvent:tg_run_id',stringFilter:{matchType:'EXACT',value:runId}}}
  ]}},limit:'20'};
}
/** Read real QA events through a service account authorized on the separate QA property.
 * NOTE: tg_run_id must be registered as an event-scoped custom dimension beforehand.
 */
export async function fetchGA4QAObservations(config,{runId,fetchImpl=fetch}={}){
 const c=validateGA4ReportingConfig(config),assertion=buildServiceAccountAssertion(c);
 const oauth=await fetchImpl('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
  signal:AbortSignal.timeout(10000),redirect:'manual'});
 if(!oauth.ok)throw refuse('Google OAuth authentication failed',502);
 const auth=await oauth.json();
 if(typeof auth.access_token!=='string'||auth.access_token.length<20)throw refuse('Google OAuth returned invalid access token',502);
 const url='https://analyticsdata.googleapis.com/v1beta/properties/'+c.qaPropertyId+':runReport';
 const response=await fetchImpl(url,{method:'POST',headers:{authorization:'Bearer '+auth.access_token,'content-type':'application/json'},
  body:JSON.stringify(buildQAReportQuery(runId)),signal:AbortSignal.timeout(12000),redirect:'manual'});
 if(!response.ok)throw refuse('GA4 QA reporting failed; verify property access and custom dimension configuration',502);
 const data=await response.json();
 if(!Array.isArray(data.rows||[]))throw refuse('Unexpected GA4 reporting result',502);
 let count=0;
 for(const row of data.rows||[]){
  if(row?.dimensionValues?.[0]?.value!=='trafficgen_qa_session'||row?.dimensionValues?.[1]?.value!==runId)continue;
  const n=Number(row?.metricValues?.[0]?.value);
  if(!Number.isSafeInteger(n)||n<0||n>1000000)throw refuse('Invalid GA4 event count',502);
  count+=n;
 }
 return {observedCount:count,source:'authenticated_qa_reporting_api',propertyId:c.qaPropertyId,
  note:'Only the designated QA property was queried. GA4 processing can be delayed.'};
}
