import {readFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const MAX_REPORT_BYTES=2*1024*1024;

/** A worker must never attach a stale, oversized or mismatched result to a job. */
export async function loadValidatedJobReport(directory,{runId,startedAt}={}){
 if(typeof runId!=='string'||!UUID.test(runId))return null;
 const began=Date.parse(startedAt);
 if(!Number.isFinite(began))return null;
 const filename=join(resolve(directory),'report-'+runId.toLowerCase()+'.json');
 try{
  const info=await stat(filename);
  if(!info.isFile()||info.size<1||info.size>MAX_REPORT_BYTES||info.mtimeMs<began-1000)return null;
  const report=JSON.parse(await readFile(filename,'utf8'));
  if(!report||report.plan?.runId!==runId||report.plan?.synthetic!==true||!report.summary||!Array.isArray(report.sessions))return null;
  return report;
 }catch{return null}
}
