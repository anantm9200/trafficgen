const $=s=>document.querySelector(s);
const KEY='tg_lab_api_key';
// Local development talks directly to its loopback API; production uses Vercel's
// authenticated, allowlisted gateway to the durable DGX campaign service.
function campaignApiUrl(path){
 if(!path.startsWith('/api/'))throw Error('Invalid Campaign Lab API path');
 if(location.hostname==='127.0.0.1'||location.hostname==='localhost')return path;
 return '/api/campaign-gateway?route='+encodeURIComponent(path.slice(5));
}
const state={key:sessionStorage.getItem(KEY)||'',campaigns:[],runs:[],summary:null,qaConfig:null,workerHealth:null,selected:null,connected:false,keyAccepted:false,polling:false,period:'7d',campaignFilter:'all',campaignSearch:''};
const say=(message,error=false)=>{const el=$('#feedback');el.textContent=message;el.classList.toggle('error',error)};
async function api(path,{method='GET',body}={}){
 if(!state.key)throw Error('Connect the service API key first');
 const response=await fetch(campaignApiUrl(path),{method,headers:{authorization:'Bearer '+state.key,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,cache:'no-store'});
 let result;try{result=await response.json()}catch{throw Error('Campaign API returned an invalid response (HTTP '+response.status+').')}
 if(!response.ok||result?.ok===false){
  if(response.status===401&&state.keyAccepted)throw Error('DGX rejected its service token. The workspace key was accepted.');
  throw Error(result?.error||'Campaign API request failed (HTTP '+response.status+')');
 }
 return result;
}
function text(tag,value,cls=''){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value??'');return el}
function btn(label,action,cls='outline'){
 const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',action);return b;
}
const short=s=>String(s).slice(0,8)+'…';
function renderCampaigns(){const area=$('#campaign-list');area.replaceChildren();if(!state.campaigns.length){area.append(text('div','No campaigns saved yet. Use the campaign builder to create your first controlled browser QA run.','empty'));return}
 const filtered=state.campaigns.filter(item=>(state.campaignFilter==='all'||item.status===state.campaignFilter)&&
  (item.draft.name+' '+item.draft.siteUrl).toLowerCase().includes(state.campaignSearch));
 if(!filtered.length){area.append(text('div','No campaigns match your search and status filter.','empty'));return}
 for(const item of filtered){const card=text('article','','campaign');const tag=text('span',item.status,'tag '+item.status);card.append(tag,text('h3',item.draft.name),text('small',item.draft.siteUrl));
  const stats=text('div','','campaign-stat');stats.append(text('span',`${item.draft.sessions} session${item.draft.sessions>1?'s':''}`),text('span',`${item.draft.devices.join(', ')}`),text('span',item.draft.regions.join(', ')));card.append(stats);
  const linked=state.runs.filter(r=>r.campaignId===item.id);
  const finished=linked.filter(r=>r.report?.summary);
  const done=finished.reduce((n,r)=>n+(r.report.summary.completed||0),0);
  const passed=finished.reduce((n,r)=>n+(r.report.summary.passed||0),0);
  const health=text('div','','campaign-health');
  const healthHead=text('div','','campaign-health-head');
  healthHead.append(text('span',`${linked.length} recorded run${linked.length===1?'':'s'}`),
   text('strong',done?`${Math.round(100*passed/done)}% journey pass`:'Awaiting worker evidence'));
  const track=text('div','','campaign-health-track');const fill=text('span','');fill.style.width=done?`${100*passed/done}%`:'0%';track.append(fill);
  health.append(healthHead,track);card.append(health);
  const actions=text('div','','campaign-actions');
  if(item.status==='draft'||item.status==='paused')actions.append(btn('Activate',()=>changeStatus(item.id,'active')));
  if(item.status==='active')actions.append(btn('Pause',()=>changeStatus(item.id,'paused')),
   btn('Run test',()=>openRun(item.id),'primary button'));
  card.append(actions);area.append(card)
 }
}
function renderRuns(){const body=$('#run-list');body.replaceChildren();if(!state.runs.length){const tr=document.createElement('tr');const td=text('td','No browser jobs have been dispatched.','table-empty');td.colSpan=5;tr.append(td);body.append(tr);return}
 for(const run of state.runs){const tr=document.createElement('tr');tr.append(text('td',short(run.id)));
  const st=document.createElement('td');st.append(text('span',run.status,'status '+run.status));tr.append(st);
  tr.append(text('td',run.sessionBudget),text('td',run.startedAt?new Date(run.startedAt).toLocaleString():'—'));
  const actions=document.createElement('td');if(['queued','running'].includes(run.status)){
   actions.append(btn('Check',()=>updateRun(run.id),'outline'),btn('Cancel',()=>cancelRun(run.id),'outline'));
  }else if(run.report){
   actions.append(btn('Inspect',()=>inspectReport(run),'outline'),btn('JSON',()=>viewReport(run),'outline'));
   if(state.qaConfig?.qaConfigured){
    if(!run.qa)actions.append(btn('Send QA event',()=>sendQA(run.id),'outline'));
    else if(run.qa.reconciliation?.state==='verified')actions.append(text('span','GA4 QA verified','status completed'));
    else if(run.qa.acceptedTransportCount>0)actions.append(btn('Verify QA',()=>verifyQA(run.id),'outline'));
   }
  }
  else actions.append(text('span',run.error||'—'));tr.append(actions);body.append(tr)
 }
}

// Command center visualizations derive exclusively from authenticated worker, campaign and QA records.
const num=x=>Number.isFinite(x)?x.toLocaleString(): '—';
const compactMs=x=>Number.isFinite(x)?(x>=1000?(x/1000).toFixed(1)+'s':Math.round(x)+'ms'):'—';
function setStateTag(node,label,kind=''){
 node.textContent=label;node.classList.toggle('is-positive',kind==='positive');node.classList.toggle('is-alert',kind==='alert');
}
function renderActivityChart(){
 const chart=$('#activity-chart'),period=state.period,now=Date.now();
 const bins=period==='24h'?24:period==='7d'?7:30;
 const unit=period==='24h'?3600000:86400000;
 const start=now-bins*unit,totals=new Array(bins).fill(0),complete=new Array(bins).fill(0);
 for(const run of state.runs){
  const when=Date.parse(run.createdAt||run.startedAt||'');
  if(!Number.isFinite(when)||when<start||when>now)continue;
  const i=Math.min(bins-1,Math.floor((when-start)/unit));
  totals[i]++;
  if(run.status==='completed')complete[i]++;
 }
 const total=totals.reduce((a,b)=>a+b,0);$('#period-run-count').textContent=state.key?num(total):'—';
 const formatter=new Intl.DateTimeFormat(undefined,period==='24h'?{hour:'numeric'}:{month:'short',day:'numeric'});
 $('#period-start').textContent=formatter.format(new Date(start));$('#period-end').textContent=formatter.format(new Date(now));
 chart.replaceChildren();
 if(!state.connected||!total){chart.append(text('div',!state.connected?'Connect to inspect worker activity.':'No recorded browser runs during this period.','chart-placeholder'))}
 const maximum=Math.max(1,...totals);
 for(let i=0;i<bins;i++){
  const bar=text('div','','activity-bar');bar.dataset.empty=totals[i]===0?'true':'false';
  const track=text('div','','activity-track'),all=text('span','','activity-total'),ok=text('span','','activity-success');
  all.style.height=(100*totals[i]/maximum)+'%';ok.style.height=(100*complete[i]/maximum)+'%';
  track.append(all,ok);bar.append(track);
  const label=formatter.format(new Date(start+i*unit));
  bar.title=`${label}: ${totals[i]} recorded run${totals[i]===1?'':'s'}, ${complete[i]} completed`;
  bar.setAttribute('aria-label',bar.title);chart.append(bar);
 }
 chart.setAttribute('aria-label',`${total} actual synthetic test runs over the last ${period}, ${complete.reduce((a,b)=>a+b,0)} completed`);
}
function renderOperations(){
 const campaigns=state.campaigns,runs=state.runs,worker=state.workerHealth,metrics=worker?.metrics||null;
 $('#campaign-active').textContent=state.connected?`${campaigns.filter(c=>c.status==='active').length} active configurations`:'Awaiting connection';
 $('#run-active').textContent=state.connected?`${runs.filter(r=>['running','queued'].includes(r.status)).length} queued / executing`:'From saved execution records';
 const verified=runs.filter(r=>r.qa?.reconciliation?.state==='verified'&&r.qa?.reconciliation?.source==='authenticated_qa_reporting_api').length;
 $('#qa-verified-count').textContent=state.connected?num(verified):'—';
 renderActivityChart();
 const online=Boolean(worker?.service==='trafficgen-dgx-worker');
 setStateTag($('#worker-state'),!state.key?'Not connected':online?'Responding':'Unavailable',online?'positive':state.key?'alert':'');
 $('#worker-availability').textContent=!state.key?'Not connected':online?'Worker online':'No worker evidence';
 $('#worker-depth').textContent=metrics?num((metrics.counts?.queued||0)+(metrics.counts?.running||0)):'—';
 $('#worker-wait').textContent=compactMs(metrics?.queueWait?.p95Ms);
 $('#worker-exec').textContent=compactMs(metrics?.runTime?.p95Ms);
 $('#worker-uptime').textContent=Number.isFinite(worker?.uptimeSeconds)?(worker.uptimeSeconds<3600?Math.floor(worker.uptimeSeconds/60)+'m':Math.floor(worker.uptimeSeconds/3600)+'h'):'—';
 const recent=$('#recent-activity');recent.replaceChildren();
 if(!runs.length){recent.append(text('div',state.connected?'No recorded browser runs yet.':'Connect to inspect execution history.','stream-empty'))}
 else for(const run of [...runs].sort((a,b)=>Date.parse(b.createdAt||'')-Date.parse(a.createdAt||'')).slice(0,4)){
  const row=text('div','','recent-row');const icon=text('span',run.status==='completed'?'✓':run.status==='failed'?'!':'◷','recent-icon '+run.status);
  const copy=text('div','','recent-copy');copy.append(text('strong','Run '+String(run.id).slice(0,8)));
  const timestamp=Date.parse(run.createdAt||run.startedAt||'');
  copy.append(text('small',`${Number.isFinite(timestamp)?new Date(timestamp).toLocaleString():'Timestamp unavailable'} · ${run.sessionBudget??'—'} planned sessions`));
  row.append(icon,copy,text('span',run.status,'status '+run.status));recent.append(row);
 }
 const accepted=runs.reduce((sum,r)=>sum+(r.qa?.acceptedTransportCount||0),0);
 $('#qa-accepted-count').textContent=state.connected?num(accepted):'—';
 $('#qa-report-count').textContent=state.connected?num(verified):'—';
 setStateTag($('#qa-state'),!state.key?'Not connected':!state.qaConfig?.qaConfigured?'Not configured':verified?'Verified evidence':'QA enabled',verified?'positive':'');
 const attempts=runs.filter(r=>r.qa).length;
 $('#qa-progress-track').firstElementChild.style.width=attempts?`${Math.round(100*verified/attempts)}%`:'0%';
 $('#qa-status-desc').textContent=!state.qaConfig?.qaConfigured?'Separate GA4 QA property is not configured. Production event collection remains blocked.':
  `${attempts} isolated QA attempt${attempts===1?'':'s'} recorded. Transport accepted does not guarantee reporting visibility.`;
 const buckets=[['Completed',runs.filter(r=>r.status==='completed').length],['In progress',runs.filter(r=>['running','queued'].includes(r.status)).length],['Failed',runs.filter(r=>['failed','cancelled'].includes(r.status)).length]];
 const outcome=$('#outcome-chart');outcome.replaceChildren();
 if(!runs.length)outcome.append(text('div',state.connected?'No outcomes to visualize.':'Awaiting run evidence.','stream-empty'));
 else for(const [label,value] of buckets){
  const row=text('div','','outcome-row');const t=text('span',label),track=text('div','','outcome-track'),fill=text('span','');
  fill.style.width=(100*value/runs.length)+'%';track.append(fill);row.append(t,track,text('strong',value));outcome.append(row);
 }
 renderQAEvidence({accepted,verified});
}
function renderQAEvidence({accepted,verified}){
 $('#qa-destination').textContent=state.qaConfig?.qaConfigured?'QA property':'Not configured';
 $('#qa-transport').textContent=state.connected?num(accepted):'—';
 $('#qa-verified-runs').textContent=state.connected?num(verified):'—';
 const list=$('#qa-audit-list');list.replaceChildren();
 const records=state.runs.filter(r=>r.qa).slice(0,8);
 if(!records.length){list.append(text('p',state.connected?'No GA4 QA delivery attempts recorded.':'Connect to load reconciliation records.','muted'));return}
 for(const run of records){const qa=run.qa;
  const row=text('div','','qa-audit-row');row.append(text('strong','Run '+String(run.id).slice(0,8)));
  row.append(text('small',`${qa.acceptedTransportCount||0} accepted · ${qa.observedCount??'—'} report-observed`));
  const checked=qa.reconciliation?.state==='verified'&&qa.reconciliation?.source==='authenticated_qa_reporting_api';
  row.append(text('span',checked?'Verified':qa.reconciliation?.state||qa.status,'status '+(checked?'completed':'queued')));list.append(row);
 }
}

function render(){renderCampaigns();renderRuns();renderOperations();
 const health=state.workerHealth?.metrics;
 $('#worker-queue-health').textContent=!state.key?'DGX worker performance: connect to inspect':
  health?`DGX: ${health.counts?.queued??0} queued · ${health.counts?.running??0} running · ${health.counts?.completed??0} completed · queue wait p95 ${health.queueWait?.p95Ms==null?'—':health.queueWait.p95Ms+' ms'} · execution p95 ${health.runTime?.p95Ms==null?'—':health.runTime.p95Ms+' ms'}`:
  'DGX worker performance: unavailable or not yet checked';
 $('#qa-connection').textContent=state.qaConfig?.qaConfigured?
  (state.qaConfig.reportingConfigured?'GA4 QA: delivery and authenticated reporting configured':'GA4 QA: delivery configured; reporting verification unavailable'):
  'GA4 QA: separate property not configured';$('#campaign-total').textContent=state.campaigns.length;
 $('#run-total').textContent=state.runs.length;
 $('#complete-total').textContent=state.summary?.completed??'—';
 $('#pass-rate').textContent=state.summary?.successRatePercent==null?'—':state.summary.successRatePercent+'%';
 $('#explicit-step-summary').textContent=state.summary?.journeySteps?` • ${state.summary.journeyStepsPassed}/${state.summary.journeySteps} explicit steps passed`:'';
 $('#connection').textContent=!state.key?'Not connected':state.connected?'API connected':state.keyAccepted?'Workspace key verified · DGX unavailable':'Checking workspace key';$('#connection').classList.toggle('connected',state.connected)
}
async function verifyWorkspaceKey(){
 if(location.hostname==='localhost'||location.hostname==='127.0.0.1'){state.keyAccepted=true;return}
 const response=await fetch('/api/auth-check',{method:'GET',
  headers:{authorization:'Bearer '+state.key},cache:'no-store'});
 let result;try{result=await response.json()}catch{throw Error('Workspace authentication returned an invalid response.')}
 if(response.status===401)throw Error('Workspace key rejected. Check TG_API_KEY for this Vercel Preview environment.');
 if(!response.ok||result?.ok!==true)throw Error('Workspace authentication is unavailable (HTTP '+response.status+').');
 state.keyAccepted=true;render();
}
async function refresh({silent=false}={}){
 if(!state.keyAccepted){if(!silent)say('Verify your workspace key first.',true);return}
 try{
  const campaigns=await api('/api/campaigns');
  const [runs,insights,qaHealth]=await Promise.all([api('/api/runs'),api('/api/insights'),api('/api/qa/health')]);
  state.campaigns=campaigns.campaigns;state.runs=runs.runs;state.summary=insights.summary;state.qaConfig=qaHealth;
  try{const result=await api('/api/worker-health');state.workerHealth=result.worker}catch{state.workerHealth=null}
  state.connected=true;render();if(!silent)say(`Connected. ${state.campaigns.length} campaign(s) and ${state.runs.length} recorded run(s).`)
 }catch(e){state.connected=false;render();if(!silent)say((state.keyAccepted?'Workspace key verified. DGX Campaign API unavailable: ':'')+e.message,true)}
}
/** Poll only active jobs with one bounded request at a time, never dispatch new browser traffic. */
async function pollActiveRuns(){
 if(!state.key||state.polling||document.visibilityState==='hidden')return;
 const active=state.runs.filter(r=>['queued','running'].includes(r.status)).slice(0,3);
 if(!active.length)return;
 state.polling=true;let changed=false;
 try{for(const run of active){
  try{const response=await api('/api/runs/'+run.id+'/refresh',{method:'POST'});
   if(response.run?.status&&response.run.status!==run.status)changed=true;
  }catch(e){say('Worker status check failed: '+e.message,true);break}
 }}finally{state.polling=false}
 if(changed)await refresh();
}
async function changeStatus(id,status){try{await api('/api/campaigns/'+id+'/status',{method:'PATCH',body:{status}});await refresh()}catch(e){say(e.message,true)}}
function openRun(id){state.selected=id;$('#proof-token').value='';$('#run-dialog').showModal()}
async function runSelected(){const verificationToken=$('#proof-token').value;$('#submit-run').disabled=true;
 try{
  const result=await api('/api/campaigns/'+state.selected+'/run',{method:'POST',body:{verificationToken,
   idempotencyKey:crypto.randomUUID().replaceAll('-','_')}});
  $('#proof-token').value='';$('#run-dialog').close();say('Verified and dispatched. Run ID: '+short(result.run.id));await refresh();location.hash='#activity'
 }catch(e){say(e.message,true)}finally{$('#submit-run').disabled=false}
}
async function updateRun(id){try{const result=await api('/api/runs/'+id+'/refresh',{method:'POST'});say('Run '+short(id)+' is '+result.run.status);await refresh()}catch(e){say(e.message,true)}}
async function sendQA(id){try{await api('/api/qa/runs/'+id+'/send',{method:'POST'});await refresh();say('QA event transport attempted; processing and report visibility are not yet verified.')}catch(e){say(e.message,true)}}
async function verifyQA(id){try{const r=await api('/api/qa/runs/'+id+'/verify',{method:'POST'});await refresh();say('GA4 QA verification: '+r.qa.reconciliation?.state)}catch(e){say(e.message,true)}}
async function cancelRun(id){try{await api('/api/runs/'+id+'/cancel',{method:'POST'});await refresh()}catch(e){say(e.message,true)}}
function inspectReport(run){
 const report=run.report||{};const sessions=report.sessions||[],summary=report.summary||{};
 $('#report-heading').textContent='Run '+short(run.id);
 $('#report-summary').textContent=`${summary.passed??0} passed / ${summary.completed??0} completed • ${summary.pagesVisited??0} pages • Synthetic QA only`;
 const list=$('#report-sessions');list.replaceChildren();
 if(!sessions.length)list.append(text('p','No session-level evidence in this report.','empty'));
 for(const session of sessions){
  const block=text('section','','report-session');
  block.append(text('h3',`Session ${session.index??'?'} • ${session.ok?'PASS':'FAIL'} • ${session.device||'unknown'} • ${session.countryCode||'—'} (emulated locale)`));
  const steps=session.journey?.steps;
  if(Array.isArray(steps)&&steps.length){
   const ordered=document.createElement('ol');ordered.className='step-list';
   for(const item of steps){const li=text('li',`${item.ok?'✓':'✕'} ${item.action||'step'} ${item.path||item.selector||''} • ${item.durationMs??'—'} ms${item.error?' • '+item.error:''}`,item.ok?'step-pass':'step-fail');ordered.append(li)}
   block.append(ordered);
   if(session.journey?.ok===false)block.append(text('p','Journey stopped at the first unsuccessful step.','muted'));
  }else{
   block.append(text('p','Legacy automatic browsing — no explicit step execution evidence.','muted'));
   const ordered=document.createElement('ol');ordered.className='step-list';
   for(const page of (session.pages||[])){ordered.append(text('li',`HTTP ${page.status??'?'} • ${page.durationMs??'—'} ms • ${page.url??'unknown URL'}`))}
   block.append(ordered);
  }
  if(session.error)block.append(text('p',session.error,'report-error'));
  list.append(block);
 }
 $('#report-dialog').showModal();
}
function addJourneyStep(action){
 const area=$('#journey-steps');if(area.children.length>=11){say('Maximum 12 journey steps including the landing page.',true);return}
 if(action==='navigate'&&area.querySelectorAll('[data-action="navigate"]').length>=3){say('Maximum four page visits including the landing page.',true);return}
 const row=document.createElement('div');row.className='journey-step';row.dataset.action=action;
 const actionText={navigate:'Visit page',assert:'Check element',scroll:'Scroll',dwell:'Wait'}[action];
 row.append(text('strong',actionText));
 const input=document.createElement('input');input.className='journey-value';input.setAttribute('aria-label',actionText);
 if(action==='navigate'){input.type='text';input.placeholder='/about';input.value='/about';input.maxLength=300}
 if(action==='assert'){input.type='text';input.placeholder='h1';input.value='h1';input.maxLength=100}
 if(action==='scroll'){input.type='number';input.value='500';input.min='100';input.max='1500'}
 if(action==='dwell'){input.type='number';input.value='5';input.min='1';input.max='30'}
 input.required=true;row.append(input);
 row.append(btn('Remove',()=>row.remove(),'outline'));
 area.append(row);input.focus();
}
function getJourney(){
 const journey=[{action:'navigate',path:String($('#create-form [name="path"]').value).trim()}];
 for(const row of $('#journey-steps').children){
  const action=row.dataset.action,raw=row.querySelector('.journey-value').value;
  if(action==='navigate')journey.push({action,path:raw.trim()});
  else if(action==='assert')journey.push({action,selector:raw.trim()});
  else if(action==='scroll')journey.push({action,distancePx:Number(raw)});
  else if(action==='dwell')journey.push({action,seconds:Number(raw)});
 }
 return journey;
}
function updateDraftPreview(){
 const form=$('#create-form'),data=new FormData(form);
 const scheduleMode=String(data.get('scheduleMode')||'manual');
 $('#schedule-fields').hidden=scheduleMode!=='recurring';
 const name=String(data.get('name')||'').trim(),site=String(data.get('siteUrl')||'').trim();
 const siteText=site||'Choose a verified website';
 const duration=scheduleMode==='manual'?'Manual approval':`Every ${data.get('everyMinutes')||30} min`;
 const requested=Number(data.get('sessions'))||0;
 const steps=$('#journey-steps').children.length+1;
 const vals=[['Campaign',name||'Untitled test'],['Website',siteText],['Landing',String(data.get('path')||'/')],
  ['Browser',String(data.get('device')||'desktop')],['Locale',String(data.get('region')||'AE')+' (emulated)'],
  ['Sessions',requested+' per run'],['Journey',steps+' explicit steps'],['Pacing',String(data.get('intervalSeconds')||8)+'s minimum'],
  ['Schedule',duration],['Analytics',String(data.get('analyticsMode')||'observe-only')==='isolated-qa'?'Separate QA property':'Production observation only']];
 const panel=$('#plan-preview');panel.replaceChildren();
 for(const [label,value] of vals){const row=text('div','','preview-item');row.append(text('span',label),text('strong',value));panel.append(row)}
}
async function exportRunsCSV(){
 try{
  if(!state.key)throw Error('Connect the API key first');
  const response=await fetch(campaignApiUrl('/api/runs.csv'),{headers:{authorization:'Bearer '+state.key},cache:'no-store'});
  if(!response.ok)throw Error('Export failed (HTTP '+response.status+')');
  const csv=await response.text(),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const link=document.createElement('a');link.href=url;link.download='trafficgen-synthetic-runs.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  say('Synthetic QA runs exported.');
 }catch(e){say(e.message,true)}
}
function viewReport(run){const blob=new Blob([JSON.stringify(run.report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download='trafficgen-synthetic-report-'+run.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000)
}
for(const button of document.querySelectorAll('[data-period]'))button.addEventListener('click',()=>{
 state.period=button.dataset.period;
 for(const el of document.querySelectorAll('[data-period]'))el.classList.toggle('active',el===button);
 renderActivityChart();
});
try{const theme=localStorage.getItem('tg_theme');if(['dark','light'].includes(theme))document.documentElement.dataset.theme=theme}catch{}
$('#theme-toggle').addEventListener('click',()=>{
 const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
 document.documentElement.dataset.theme=next;
 try{localStorage.setItem('tg_theme',next)}catch{}
 $('#theme-toggle').setAttribute('aria-label','Switch to '+(next==='dark'?'light':'dark')+' theme');
});
function activateRoute(){
 const valid=['overview','campaigns','create','activity','analytics','settings'];
 const raw=decodeURIComponent(location.hash.replace(/^#/,''));
 const route=valid.includes(raw)?raw:'overview';
 for(const screen of document.querySelectorAll('.workspace-screen'))screen.hidden=screen.id!==route;
 for(const link of document.querySelectorAll('.rail .nav')){
  const active=link.getAttribute('href')==='#'+route;
  link.classList.toggle('active',active);
  if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 const current=document.querySelector('.rail .nav.active');
 const crumb=document.querySelector('.crumb-location');if(current&&crumb)crumb.textContent=current.textContent.trim();
 window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',activateRoute);
activateRoute();
async function connectWorkspace(){
 const key=$('#api-key').value.trim();
 if(key.length<24)return say('Enter a TrafficGen workspace key of at least 24 characters.',true);
 state.key=key;state.keyAccepted=false;sessionStorage.setItem(KEY,key);$('#api-key').value='';
 try{await verifyWorkspaceKey();await refresh()}
 catch(e){
  if(e.message.includes('key rejected')){state.key='';sessionStorage.removeItem(KEY)}
  state.keyAccepted=false;state.connected=false;render();say(e.message,true);
 }
}
$('#connect').addEventListener('click',connectWorkspace);
$('#disconnect').addEventListener('click',()=>{state.key='';state.connected=false;state.keyAccepted=false;sessionStorage.removeItem(KEY);state.campaigns=[];state.runs=[];state.summary=null;state.qaConfig=null;state.workerHealth=null;render();say('Service key cleared.')});
$('#close-report').addEventListener('click',()=>$('#report-dialog').close());
for(const [id,action] of [['add-nav','navigate'],['add-assert','assert'],['add-scroll','scroll'],['add-dwell','dwell']])$('#'+id).addEventListener('click',()=>addJourneyStep(action));
$('#export-runs').addEventListener('click',exportRunsCSV);
$('#campaign-search').addEventListener('input',event=>{state.campaignSearch=event.target.value.trim().toLowerCase();renderCampaigns()});
for(const control of document.querySelectorAll('[data-campaign-filter]'))control.addEventListener('click',()=>{
 state.campaignFilter=control.dataset.campaignFilter;
 for(const button of document.querySelectorAll('[data-campaign-filter]'))button.classList.toggle('active',button===control);
 renderCampaigns();
});
$('#create-form').addEventListener('input',updateDraftPreview);
$('#create-form').addEventListener('change',updateDraftPreview);
for(const id of ['add-nav','add-assert','add-scroll','add-dwell'])$('#'+id).addEventListener('click',()=>setTimeout(updateDraftPreview,0));
$('#journey-steps').addEventListener('click',event=>{if(event.target.closest('button'))setTimeout(updateDraftPreview,0)});
updateDraftPreview();
$('#refresh').addEventListener('click',refresh);$('#refresh-runs').addEventListener('click',refresh);$('#submit-run').addEventListener('click',runSelected);
$('#create-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;const data=new FormData(form);
 let schedule;try{schedule=String(data.get('scheduleMode'))==='recurring'?{type:'recurring',
  startAt:new Date(String(data.get('startAt'))).toISOString(),endAt:new Date(String(data.get('endAt'))).toISOString(),
  everyMinutes:Number(data.get('everyMinutes')),dailyBudget:Number(data.get('dailyBudget'))}:{type:'manual'}}
 catch{say('Choose valid start and end times for the recurring schedule.',true);return}
 const draft={name:String(data.get('name')),siteUrl:String(data.get('siteUrl')),journey:getJourney(),
  devices:[String(data.get('device'))],regions:[String(data.get('region'))],sessions:Number(data.get('sessions')),
  concurrency:1,intervalSeconds:Number(data.get('intervalSeconds')),analyticsMode:String(data.get('analyticsMode')),schedule};
 try{await api('/api/campaigns',{method:'POST',body:draft});form.reset();$('#journey-steps').replaceChildren();updateDraftPreview();await refresh();location.hash='#campaigns'}
 catch(e){say(e.message,true)}
});
setInterval(pollActiveRuns,15000);
setInterval(()=>{if(state.keyAccepted&&state.connected&&!state.polling&&document.visibilityState!=='hidden')refresh({silent:true})},60000);
if(state.key)verifyWorkspaceKey().then(()=>refresh()).catch(e=>{
 if(e.message.includes('key rejected')){state.key='';sessionStorage.removeItem(KEY)}
 state.keyAccepted=false;state.connected=false;render();say(e.message,true);
});else render();
