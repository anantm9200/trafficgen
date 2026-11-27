import {buildServiceAccountAssertion,validateGA4ReportingConfig} from './ga4-reporting.mjs';

const fail=(message,status=503)=>Object.assign(new Error(message),{status});
/** Before sending *any* synthetic QA event, verify that its G-ID is a web stream
 * inside the explicitly configured isolated QA property, using the GA4 Admin API.
 * This prevents a distinct-but-production G-ID from being mistaken for a QA stream.
 */
export async function verifyIsolatedQAStream(raw,{qaMeasurementId,fetchImpl=fetch}={}){
 const cfg=validateGA4ReportingConfig(raw);
 if(!/^G-[A-Z0-9]{5,20}$/.test(qaMeasurementId||''))throw fail('Invalid QA measurement identifier',400);
 const assertion=buildServiceAccountAssertion(cfg);
 let oauth;
 try{oauth=await fetchImpl('https://oauth2.googleapis.com/token',{
  method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
  signal:AbortSignal.timeout(10000)
 })}catch{throw fail('GA4 QA stream authentication unavailable',502)}
 if(!oauth.ok||oauth.status>=300)throw fail('GA4 QA stream authentication failed',502);
 let auth;try{auth=await oauth.json()}catch{throw fail('GA4 QA OAuth returned invalid data',502)}
 if(typeof auth.access_token!=='string'||auth.access_token.length<20)throw fail('GA4 QA OAuth token invalid',502);
 let pageToken='',pages=0;
 do{
  const url=new URL('https://analyticsadmin.googleapis.com/v1beta/properties/'+cfg.qaPropertyId+'/dataStreams');
  url.searchParams.set('pageSize','200');if(pageToken)url.searchParams.set('pageToken',pageToken);
  let res;
  try{res=await fetchImpl(url.toString(),{method:'GET',redirect:'manual',
   headers:{authorization:'Bearer '+auth.access_token,accept:'application/json'},signal:AbortSignal.timeout(10000)})}
  catch{throw fail('GA4 QA data stream verification unavailable',502)}
  if(!res.ok||res.status>=300)throw fail('GA4 QA property stream verification failed',502);
  let result;try{result=await res.json()}catch{throw fail('GA4 Admin API returned invalid data',502)}
  if(!Array.isArray(result.dataStreams||[]))throw fail('GA4 Admin API returned malformed streams',502);
  for(const stream of result.dataStreams||[]){
   if(stream?.type==='WEB_DATA_STREAM'&&stream?.webStreamData?.measurementId===qaMeasurementId){
    const name=stream.name;
    if(typeof name!=='string'||!name.startsWith('properties/'+cfg.qaPropertyId+'/dataStreams/'))
     throw fail('GA4 stream property identity mismatch',502);
    return {verified:true,source:'analytics_admin_api',propertyId:cfg.qaPropertyId,measurementId:qaMeasurementId};
   }
  }
  pageToken=typeof result.nextPageToken==='string'?result.nextPageToken:'';
  pages++;
 }while(pageToken&&pages<10);
 throw fail('Configured QA measurement ID does not belong to the designated QA property',403);
}
