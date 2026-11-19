import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {CampaignController} from './campaign-controller.mjs';
import {CampaignStore} from './campaign-store.mjs';
import {makeDnsOwnershipAdapter,makeDgxAdapter,makeLoopbackDgxAdapter,makeSiteCredentialsResolver} from './worker-adapters.mjs';
import {aggregateSyntheticCampaignReports,exportSyntheticRunsCSV} from './campaign-report.mjs';
import {reconcileWorkerRun,reconcilePendingRuns} from './run-reconciliation.mjs';
import {QARegistry} from './qa-registry.mjs';
import {validateIsolatedQA,sendIsolatedQABatch} from './qa-analytics.mjs';
import {fetchGA4QAObservations} from './ga4-reporting.mjs';
import {verifyIsolatedQAStream} from './ga4-stream-proof.mjs';
const fail=(msg,status=400)=>Object.assign(new Error(msg),{status});
const LIMIT=16384;
async function readJson(req){
 let bytes=0,parts=[];
 for await(const chunk of req){bytes+=chunk.length;if(bytes>LIMIT)throw fail('Request too large',413);parts.push(chunk)}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}')}catch{throw fail('Invalid JSON body')}
}
function authorized(req,key){
 if(typeof key!=='string'||key.length<24)throw fail('Server authentication not configured',503);
 const raw=req.headers.authorization||'';
 const given=raw.startsWith('Bearer ')?raw.slice(7):'';
 const a=Buffer.from(given),b=Buffer.from(key);
 if(a.length!==b.length||!timingSafeEqual(a,b))throw fail('Unauthorized',401);
}
function send(res,status,data,type='application/json; charset=utf-8'){
 res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff',
  'x-frame-options':'DENY','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
 res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
export function createCampaignApi({store=new CampaignStore(),verifySite,dispatchWorker,lookupWorkerJob,cancelWorkerJob,healthWorker,
 siteCredentials,apiKey=process.env.TG_API_KEY,webRoot=null,autoSchedule=false,tickIntervalMs=60000,
 qaConfig=null,qaReportingConfig=null,sendQABatch=sendIsolatedQABatch,readQAReport=fetchGA4QAObservations,verifyQAStream=verifyIsolatedQAStream}={}){
 const controller=new CampaignController({store,verifySite,dispatchWorker,siteCredentials});
 const qa=new QARegistry(store.db);
 let ticker=null,runMonitor=null,monitorInProgress=false;
 async function handle(req,res){
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,mode:'synthetic-testing',storage:'sqlite',analytics:'production-collection-blocked'});
   if(webRoot&&req.method==='GET'&&['/','/index.html','/app.js','/styles.css'].includes(url.pathname)){
    const path=url.pathname==='/'?'/index.html':url.pathname;
    const content=await readFile(join(webRoot,path.slice(1)),'utf8');
    const type=path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
    return send(res,200,content,type);
   }
   authorized(req,apiKey);
   if(req.method==='GET'&&url.pathname==='/api/worker-health'){
    if(!healthWorker)throw fail('Worker health integration is not configured',503);
    const worker=await healthWorker();
    if(!worker?.ok||worker.service!=='trafficgen-dgx-worker')throw fail('Unexpected worker identity',502);
    return send(res,200,{ok:true,worker:{service:worker.service,mode:worker.mode,uptimeSeconds:worker.uptimeSeconds,
     activeJob:worker.activeJob||null,metrics:worker.metrics??null}});
   }
   if(req.method==='GET'&&url.pathname==='/api/qa/health')return send(res,200,{ok:true,qaConfigured:!!qaConfig,reportingConfigured:!!qaReportingConfig,
  status:'isolated-qa-only',note:'Measurement Protocol transport is not proof of event processing or reporting.'});
   if(req.method==='GET'&&url.pathname==='/api/campaigns')return send(res,200,{ok:true,campaigns:store.list()});
   if(req.method==='POST'&&url.pathname==='/api/campaigns')return send(res,201,{ok:true,campaign:store.create(await readJson(req))});
   if(req.method==='GET'&&url.pathname==='/api/runs'){
    const byId=new Map(qa.list().map(item=>[item.runId,item]));
    return send(res,200,{ok:true,runs:store.allRuns().map(run=>({...run,qa:byId.get(run.id)||null}))});
   }
   if(req.method==='GET'&&url.pathname==='/api/insights'){
    const reports=store.allRuns().filter(x=>x.status==='completed'&&x.report).map(x=>x.report);
    return send(res,200,{ok:true,summary:aggregateSyntheticCampaignReports(reports)});
   }
   if(req.method==='GET'&&url.pathname==='/api/runs.csv'){
    const reports=store.allRuns().filter(x=>x.status==='completed'&&x.report).map(x=>x.report);
    return send(res,200,exportSyntheticRunsCSV(reports),'text/csv; charset=utf-8');
   }
   if(req.method==='POST'&&url.pathname==='/api/scheduler/tick'){
    return send(res,200,{ok:true,results:await controller.scheduledTick({maxLaunches:1})});
   }
   const qaRoute=url.pathname.match(/^\/api\/qa\/runs\/([a-f0-9-]{36})(?:\/(send|verify))?$/);
   if(qaRoute){
    const runId=qaRoute[1],action=qaRoute[2];
    if(req.method==='GET'&&!action)return send(res,200,{ok:true,qa:qa.get(runId)});
    if(req.method==='POST'&&action==='send'){
     if(!qaConfig||!qaReportingConfig)throw fail('Isolated GA4 QA stream and reporting credentials are required',503);
     validateIsolatedQA(qaConfig);
     // Verify a separate QA *property*, not merely a different G-ID string.
     const proof=await verifyQAStream(qaReportingConfig,{qaMeasurementId:qaConfig.qaMeasurementId});
     if(proof?.verified!==true||proof.source!=='analytics_admin_api'||
        proof.propertyId!==qaReportingConfig.qaPropertyId||proof.measurementId!==qaConfig.qaMeasurementId)
      throw fail('GA4 QA stream did not match the isolated property',502);
     const run=store.getRun(runId);
     if(!run||run.status!=='completed'||!run.report)throw fail('Completed synthetic run required',409);
     const count=run.report.summary?.completed;
     qa.reserve(runId,count);
     let accepted=0;
     try{
      // One bounded transport for up to 25 synthetic QA events. An HTTP success
      // acknowledges only transport, NOT per-event processing by GA4.
      const result=await sendQABatch(qaConfig,{runId,count,elapsedMs:1000});
      if(result.state==='transport_accepted'&&result.acceptedCount===count)accepted=count;
     }finally{
      // No automatic retries: Measurement Protocol is not idempotent on network timeouts.
      qa.finish(runId,{acceptedCount:accepted});
     }
     return send(res,200,{ok:true,qa:qa.get(runId),note:'Transport accepted is NOT proof of GA4 report visibility.'});
    }
    if(req.method==='POST'&&action==='verify'){
     if(!qaConfig||!qaReportingConfig)throw fail('Authenticated GA4 QA reporting is not configured',503);
     validateIsolatedQA(qaConfig);
     if(!qa.get(runId))throw fail('QA event send has not been attempted',409);
     const result=await readQAReport(qaReportingConfig,{runId});
     if(result.source!=='authenticated_qa_reporting_api')throw fail('Untrusted analytics reporting source',502);
     // The reporting response must be bound to the configured isolated QA *property*.
     // A trusted-looking source string alone cannot establish its measurement origin.
     if(typeof qaReportingConfig.qaPropertyId!=='string'||
        !/^\d{6,15}$/.test(qaReportingConfig.qaPropertyId)||
        String(result.propertyId)!==qaReportingConfig.qaPropertyId)
      throw fail('GA4 QA reporting property identity mismatch',502);
     if(!Number.isSafeInteger(result.observedCount)||result.observedCount<0)
      throw fail('Invalid GA4 QA event observation count',502);
     return send(res,200,{ok:true,qa:qa.reconcile(runId,{observedCount:result.observedCount,
      source:result.source,qaMeasurementId:qaConfig.qaMeasurementId})});
    }
   }
   const campaign=url.pathname.match(/^\/api\/campaigns\/([a-f0-9-]{36})(?:\/(run|status))?$/);
   if(campaign){
    const id=campaign[1],action=campaign[2];
    if(req.method==='GET'&&!action){const c=store.get(id);return c?send(res,200,{ok:true,campaign:c,runs:store.runs(id)}):send(res,404,{ok:false,error:'Campaign not found'});}
    if(req.method==='PATCH'&&action==='status'){
     const body=await readJson(req);return send(res,200,{ok:true,campaign:store.status(id,body.status)});
    }
    if(req.method==='POST'&&action==='run'){
     const body=await readJson(req);
     return send(res,202,{ok:true,...await controller.launch(id,{verificationToken:body.verificationToken,
      verificationMethod:body.verificationMethod||'dns_txt',idempotencyKey:body.idempotencyKey||randomUUID()})});
    }
   }
   const run=url.pathname.match(/^\/api\/runs\/([a-f0-9-]{36})(?:\/(refresh|cancel))?$/);
   if(run){
    const id=run[1],action=run[2],r=store.getRun(id);
    if(!r)return send(res,404,{ok:false,error:'Run not found'});
    if(req.method==='GET'&&!action)return send(res,200,{ok:true,run:r});
    if(req.method==='POST'&&action==='refresh'){
     const result=await reconcileWorkerRun(store,id,lookupWorkerJob);
     return send(res,200,{ok:true,run:result.run});
    }
    if(req.method==='POST'&&action==='cancel'){
     if(!r.workerJobId||!cancelWorkerJob)throw fail('Worker cancellation integration not configured',503);
     if(['completed','failed','cancelled'].includes(r.status))return send(res,200,{ok:true,run:r});
     const remote=await cancelWorkerJob(r.workerJobId);
     if(!remote?.ok||remote.job?.id!==r.workerJobId||remote.job.status!=='cancelled')throw fail('Worker did not confirm cancellation',502);
     return send(res,200,{ok:true,run:store.updateRun(id,'cancelled')});
    }
   }
   return send(res,404,{ok:false,error:'Not found'});
  }catch(e){
   const status=Number.isInteger(e.status)?e.status:500;
   // Never return internal stack traces, worker payloads, or credentials.
   const message=status>=500?'Operation failed; check server integration':String(e.message).slice(0,160);
   return send(res,status,{ok:false,error:message});
  }
 }
 const server=http.createServer(handle);
 const originalListen=server.listen.bind(server);
 server.listen=(...args)=>{
  const result=originalListen(...args);
  if(autoSchedule){ticker=setInterval(()=>controller.scheduledTick({maxLaunches:1}).catch(()=>{}),tickIntervalMs);ticker.unref()}
  // Reconcile jobs even when no dashboard is open. Bounded read-side checks only.
  if(typeof lookupWorkerJob==='function'){
   runMonitor=setInterval(async()=>{
    if(monitorInProgress)return;
    monitorInProgress=true;
    try{await reconcilePendingRuns({store,lookupWorkerJob,limit:3})}
    catch(error){console.error('Worker reconciliation failed:',String(error.message).slice(0,120))}
    finally{monitorInProgress=false}
   },30000);
   runMonitor.unref?.();
  }
  return result;
 };
 const originalClose=server.close.bind(server);
 server.close=(...args)=>{if(ticker)clearInterval(ticker);if(runMonitor)clearInterval(runMonitor);return originalClose(...args)};
 return {server,store,controller,qa};
}
export function createConfiguredCampaignApi(env=process.env,{webRoot=null}={}){
 const remote=env.TG_CAMPAIGN_LOCAL_WORKER==='1'?makeLoopbackDgxAdapter({env}):makeDgxAdapter({env});
 return createCampaignApi({store:new CampaignStore({path:env.TG_CAMPAIGN_DB||'./.data/campaigns.sqlite'}),
  verifySite:makeDnsOwnershipAdapter(),...remote,siteCredentials:makeSiteCredentialsResolver(env),
  apiKey:env.TG_API_KEY,webRoot,autoSchedule:env.TG_SCHEDULER_ENABLED==='1',
  qaConfig:env.GA4_QA_MEASUREMENT_ID&&env.GA4_PRODUCTION_MEASUREMENT_ID&&env.GA4_QA_API_SECRET?
   {qaMeasurementId:env.GA4_QA_MEASUREMENT_ID,productionMeasurementId:env.GA4_PRODUCTION_MEASUREMENT_ID,qaApiSecret:env.GA4_QA_API_SECRET}:null,
  qaReportingConfig:env.GA4_QA_PROPERTY_ID&&env.GA4_QA_SA_EMAIL&&env.GA4_QA_SA_PRIVATE_KEY?
   {qaPropertyId:env.GA4_QA_PROPERTY_ID,serviceAccountEmail:env.GA4_QA_SA_EMAIL,privateKeyPem:env.GA4_QA_SA_PRIVATE_KEY}:null});
}
