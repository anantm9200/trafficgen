import {randomUUID} from 'node:crypto';
const idPattern=/^G-[A-Z0-9]{5,20}$/;
export function validateIsolatedQA(config){
 if(!config||typeof config!=='object')throw new Error('Explicit GA4 QA configuration required');
 const {qaMeasurementId,productionMeasurementId,qaApiSecret}=config;
 if(!idPattern.test(qaMeasurementId||'')||!idPattern.test(productionMeasurementId||''))
  throw new Error('Both QA and production GA4 measurement IDs are required');
 if(qaMeasurementId===productionMeasurementId)throw new Error('QA destination cannot be production GA4');
 if(typeof qaApiSecret!=='string'||qaApiSecret.length<8)throw new Error('QA API secret required');
 return {qaMeasurementId,productionMeasurementId,qaApiSecret};
}
export function createQAEvent({runId,sessionNumber=1,elapsedMs=1,clientId}={}){
 if(typeof runId!=='string'||!/^[a-f\d-]{36}$/i.test(runId))throw new Error('Valid runId required');
 if(!Number.isInteger(sessionNumber)||sessionNumber<1||sessionNumber>25)throw new Error('Invalid QA session number');
 const id=clientId??randomUUID();
 if(typeof id!=='string'||id.length<8||id.length>80)throw new Error('Invalid QA client identifier');
 return {client_id:id,non_personalized_ads:true,
  events:[{name:'trafficgen_qa_session',params:{
   engagement_time_msec:Math.max(1,Math.min(600000,Math.round(elapsedMs))),
   traffic_type:'internal',tg_synthetic:1,tg_qa_only:1,tg_run_id:runId,tg_session_number:sessionNumber
  }}]};
}
export async function sendIsolatedQAEvent(config,session,{fetchImpl=fetch,debug=false}={}){
 const c=validateIsolatedQA(config);
 const payload=createQAEvent(session);
 const url=new URL('https://www.google-analytics.com/'+(debug?'debug/mp/collect':'mp/collect'));
 url.searchParams.set('measurement_id',c.qaMeasurementId);url.searchParams.set('api_secret',c.qaApiSecret);
 let response;
 try{response=await fetchImpl(url.toString(),{
  method:'POST',headers:{'content-type':'application/json','user-agent':'TrafficGen-QA/2'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(7000)
 })}catch(error){return {state:'transport_failed',error:String(error?.message||error).slice(0,120),synthetic:true}}
 let validation=null;
 if(debug){
  const body=await response.json().catch(()=>null);
  validation=Array.isArray(body?.validationMessages)?body.validationMessages.map(m=>({fieldPath:m.fieldPath,severity:m.severity})).slice(0,10):[];
 }
 return {state:response.ok?(debug?'debug_transport_accepted':'transport_accepted'):'transport_rejected',
  httpStatus:response.status,synthetic:true,qaOnly:true,eventName:'trafficgen_qa_session',
  processed:false,reportVisible:false,validation,
  note:'HTTP success proves transport only, not processing or report visibility.'};
}
/** Observations must come from an authenticated QA-property reporting integration. */
export function reconcileQAObservations({runId,expectedCount,observedCount,observationSource,propertyMeasurementId,qaMeasurementId}={}){
 if(typeof runId!=='string'||!runId||!Number.isInteger(expectedCount)||expectedCount<0||
  !Number.isInteger(observedCount)||observedCount<0)throw new Error('Invalid reconciliation counts');
 if(observationSource!=='authenticated_qa_reporting_api'||propertyMeasurementId!==qaMeasurementId)
  return {state:'unverified',expectedCount,reportedCount:null,synthetic:true};
 return {state:observedCount>=expectedCount?'verified':'partial',expectedCount,reportedCount:observedCount,
  synthetic:true,source:observationSource};
}

/** One bounded Measurement Protocol request per QA run (GA4 allows max 25 events).
 * All events are identified as synthetic and use the dedicated QA stream only.
 */
export function createQABatchEvent({runId,count,elapsedMs=1000,clientId}={}){
 if(!Number.isInteger(count)||count<1||count>25)throw new Error('QA batch requires 1–25 events');
 const first=createQAEvent({runId,sessionNumber:1,elapsedMs,clientId});
 return {...first,events:Array.from({length:count},(_,i)=>({
  name:'trafficgen_qa_session',params:{...first.events[0].params,tg_session_number:i+1}
 }))};
}
export async function sendIsolatedQABatch(config,{runId,count,elapsedMs=1000}={}, {fetchImpl=fetch}={}){
 const c=validateIsolatedQA(config),payload=createQABatchEvent({runId,count,elapsedMs});
 const endpoint=new URL('https://www.google-analytics.com/mp/collect');
 endpoint.searchParams.set('measurement_id',c.qaMeasurementId);
 endpoint.searchParams.set('api_secret',c.qaApiSecret);
 let response;
 try{response=await fetchImpl(endpoint.toString(),{
  method:'POST',headers:{'content-type':'application/json','user-agent':'TrafficGen-Synthetic-QA/2'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(7000),redirect:'manual'
 })}catch{
  return {state:'transport_unconfirmed',acceptedCount:0,synthetic:true,qaOnly:true,
   note:'Network failure; no automatic retry because GA4 may already have received this batch.'};
 }
 if(response.status>=300&&response.status<400)throw new Error('GA4 QA endpoint redirect rejected');
 return {state:response.ok?'transport_accepted':'transport_rejected',
  acceptedCount:response.ok?count:0,httpStatus:response.status,synthetic:true,qaOnly:true,
  processed:false,reportVisible:false,
  note:'Batch transport accepted does not confirm GA4 processing or reporting.'};
}
