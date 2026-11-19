export function percentile(values,p){
 if(!Array.isArray(values)||!values.length)return null;
 const sorted=values.filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 return sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil((p/100)*sorted.length)-1))];
}
export function summarizeDurations(values){
 const valid=values.filter(n=>Number.isFinite(n)&&n>=0);
 return {count:valid.length,p50Ms:percentile(valid,50),p95Ms:percentile(valid,95),maxMs:valid.length?Math.max(...valid):null};
}
export function queueMetrics(rows,now=Date.now()){
 const counts={queued:0,running:0,completed:0,failed:0,cancelled:0},waits=[],runs=[],pending=[];
 for(const j of rows??[]){
  if(Object.hasOwn(counts,j.status))counts[j.status]++;
  const created=Date.parse(j.created_at),started=Date.parse(j.started_at),finished=Date.parse(j.finished_at);
  if(Number.isFinite(created)&&Number.isFinite(started)&&started>=created)waits.push(started-created);
  if(Number.isFinite(started)&&Number.isFinite(finished)&&finished>=started)runs.push(finished-started);
  if(j.status==='queued'&&Number.isFinite(created))pending.push(created);
 }
 return {counts,queueWait:summarizeDurations(waits),runTime:summarizeDurations(runs),oldestQueuedMs:pending.length?Math.max(0,now-Math.min(...pending)):null};
}
