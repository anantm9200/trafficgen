import {summarizeMs} from './execution-engine.mjs';
function count(r,field){const n=r?.summary?.[field];return Number.isSafeInteger(n)&&n>=0?n:0}
function rounds(value){return Math.round(value*100)/100}
export function aggregateSyntheticCampaignReports(reports){
 if(!Array.isArray(reports)||reports.length>1000)throw new Error('Invalid report collection');
 const total={runs:reports.length,requested:0,completed:0,passed:0,failed:0,pagesVisited:0,
  jsErrors:0,httpErrors:0,analyticsRequestsObserved:0,explicitJourneySessions:0,legacyBrowseSessions:0,
  journeySteps:0,journeyStepsPassed:0,journeyStepsFailed:0,assertionFailures:0};
 const latencies=[];const startup=[],stepTimings=[];let verifiedQA=0;
 for(const r of reports){
  if(r?.plan?.synthetic===false)throw new Error('Non-synthetic record cannot be mixed into QA reporting');
  total.requested+=count(r,'requested');total.completed+=count(r,'completed');
  total.passed+=count(r,'passed');total.failed+=count(r,'failed');
  total.pagesVisited+=count(r,'pagesVisited');
  total.jsErrors+=count(r,'javaScriptErrors');total.httpErrors+=count(r,'httpErrors');
  total.analyticsRequestsObserved+=count(r,'analyticsRequestsObserved');
  const s=r?.summary?.performance?.browserStartupMs;
  if(Number.isFinite(s)&&s>=0)startup.push(s);
  for(const session of r?.sessions??[]){
   for(const page of session.pages??[])if(Number.isFinite(page.durationMs)&&page.durationMs>=0)latencies.push(page.durationMs);
   if(!Array.isArray(session.journey?.steps)){total.legacyBrowseSessions++;continue}
   total.explicitJourneySessions++;
   for(const step of session.journey.steps){
    total.journeySteps++;
    if(step.ok===true)total.journeyStepsPassed++;else {total.journeyStepsFailed++;if(step.action==='assert')total.assertionFailures++}
    if(Number.isFinite(step.durationMs)&&step.durationMs>=0)stepTimings.push(step.durationMs);
   }
  }
  if(r?.qaReconciliation?.state==='verified'&&r?.qaReconciliation?.source==='authenticated_qa_reporting_api')verifiedQA++;
 }
 return {...total,successRatePercent:total.completed?rounds(total.passed/total.completed*100):null,
  completionRatePercent:total.requested?rounds(total.completed/total.requested*100):null,
  browserStartupMs:summarizeMs(startup),navigationMs:summarizeMs(latencies),journeyStepMs:summarizeMs(stepTimings),
  journeyStepPassRatePercent:total.journeySteps?rounds(100*total.journeyStepsPassed/total.journeySteps):null,
  verifiedQAReports:verifiedQA,synthetic:true,
  warning:'Synthetic QA sessions only. Counts are not real visitors, traffic acquisition or conversions.'};
}
const fields=['runId','status','requested','completed','passed','failed','browserStartupMs','journeySteps','failedSteps','ga4QAState'];
function csvField(value){const txt=String(value??'');const safe=/^[=+@\-\t\r]/.test(txt)?"'"+txt:txt;return '"'+safe.replaceAll('"','""')+'"'}
export function exportSyntheticRunsCSV(reports){
 if(!Array.isArray(reports)||reports.length>1000)throw new Error('Too many reports');
 const lines=[fields.map(csvField).join(',')];
 for(const r of reports){
  const row={runId:r?.plan?.runId??'',status:r?.summary?.stoppedEarly?'stopped_early':'completed',
   requested:count(r,'requested'),completed:count(r,'completed'),passed:count(r,'passed'),failed:count(r,'failed'),
   browserStartupMs:r?.summary?.performance?.browserStartupMs??'',
   journeySteps:(r?.sessions??[]).reduce((n,s)=>n+(s.journey?.steps?.length??0),0),
   failedSteps:(r?.sessions??[]).reduce((n,s)=>n+(s.journey?.steps?.filter(x=>x.ok===false).length??0),0),
   ga4QAState:r?.qaReconciliation?.source==='authenticated_qa_reporting_api'?r.qaReconciliation.state:'unverified'};
  lines.push(fields.map(f=>csvField(row[f])).join(','));
 }
 return lines.join('\n')+'\n';
}
