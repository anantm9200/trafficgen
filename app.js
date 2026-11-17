/* TrafficGen web control panel. Real APIs, real saved plans, no invented visitor metrics. */
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const STORE='trafficgen_workspace_v1';
const TOKEN_KEY='trafficgen_session_api_key';
const FLAG={US:'🇺🇸',IN:'🇮🇳',AE:'🇦🇪',DE:'🇩🇪',GB:'🇬🇧',FR:'🇫🇷',SG:'🇸🇬',AU:'🇦🇺',CA:'🇨🇦',ZA:'🇿🇦',NA:'🇳🇦',TZ:'🇹🇿'};
const DEVICE_ICON={desktop:'▣',iphone:'▯',android:'▯',ipad:'▤',tablet:'▤'};
const UTM_LABELS={utm_source:'Traffic source',utm_medium:'Medium',utm_campaign:'Campaign name',utm_id:'Campaign ID',utm_term:'Campaign term',utm_content:'Creative / content',utm_source_platform:'Source platform',utm_creative_format:'Creative format',utm_marketing_tactic:'Marketing tactic'};
const FALLBACK_COUNTRIES={US:{name:'United States'},IN:{name:'India'},AE:{name:'United Arab Emirates'},DE:{name:'Germany'},GB:{name:'United Kingdom'},FR:{name:'France'},SG:{name:'Singapore'},AU:{name:'Australia'},CA:{name:'Canada'},ZA:{name:'South Africa'},NA:{name:'Namibia'},TZ:{name:'Tanzania'}};
const FALLBACK_DEVICES={desktop:{name:'Desktop',class:'desktop'},iphone:{name:'iPhone',class:'mobile'},android:{name:'Android',class:'mobile'},ipad:{name:'iPad',class:'tablet'},tablet:{name:'Android tablet',class:'tablet'}};
const emptyStorage=()=>({campaigns:[],reports:[],inspections:[],sites:[]});
function storageLoad(){try{const x=JSON.parse(localStorage.getItem(STORE));if(!Array.isArray(x?.campaigns)||!Array.isArray(x?.reports))return emptyStorage();
 const sites=Array.isArray(x.sites)?x.sites.filter(y=>y&&typeof y.hostname==='string'&&typeof y.verificationToken==='string'):[];
 for(const c of x.campaigns){
  try{const u=new URL(c.targetUrl);if(!sites.some(y=>y.hostname===u.hostname)&&c.verificationToken)sites.push({
   hostname:u.hostname,origin:u.origin,verificationToken:c.verificationToken,authorized:false,status:'pending',ga4:null,verificationMethod:'dns_txt',verifiedAt:null,migrated:true
  });}catch{}
 }
 return {...emptyStorage(),...x,inspections:Array.isArray(x.inspections)?x.inspections:[],sites};}catch{return emptyStorage();}}
const state={route:'overview',step:0,campaignId:null,spec:null,health:null,runs:null,store:storageLoad(),apiKey:sessionStorage.getItem(TOKEN_KEY)||'',countryCodes:['AE','IN','US'],devices:['desktop','iphone'],busy:false,authenticated:false,siteToken:freshToken()};
const encode=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const time=d=>{if(!d)return '—';const x=new Date(d);return Number.isNaN(x.getTime())?'—':x.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})};
function notify(msg){const el=$('#toast');el.textContent=msg;el.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.classList.remove('visible'),3800);}
function save(){localStorage.setItem(STORE,JSON.stringify(state.store));renderCounts();renderCampaigns();renderWebsites();renderSiteOptions();renderReports();renderInspections();}
function displayStatus(value){const s=String(value||'').toLowerCase();if(['success','completed'].includes(s))return ['success','Passed'];if(['failure','error','cancelled','timed_out'].includes(s))return ['failure','Failed'];if(['queued','pending','in_progress','waiting','requested'].includes(s))return ['pending','Running'];return ['neutral',value||'Unknown'];}
const API_LABEL={'overview':'Overview','builder':'New test','campaigns':'Campaigns','runs':'Run monitor','analytics':'Analytics','websites':'Websites','devices':'Device lab','settings':'Integrations'};
function nav(route){if(!API_LABEL[route])return;state.route=route;$$('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+route));$$('[data-route].nav-link').forEach(el=>el.classList.toggle('active',el.dataset.route===route));$('#breadcrumb-current').textContent=API_LABEL[route];$('#sidebar').classList.remove('open');$('#mobile-backdrop').classList.remove('open');if(location.hash!=='#'+route)history.replaceState(null,'','#'+route);window.scrollTo({top:0,behavior:'instant'});if(route==='runs')void refreshRuns();if(route==='analytics'){renderReports();renderInspections();}}
function freshToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return 'tg_'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function newId(){return crypto.randomUUID?.()||'test-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
async function http(path,{method='GET',body=null,auth=false}={}){
 const headers={'Accept':'application/json'};
 if(body!==null)headers['Content-Type']='application/json';
 if(auth){if(!state.apiKey)throw new Error('Connect your API access key in Integrations first.');headers.Authorization='Bearer '+state.apiKey;}
 const r=await fetch(path,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
 let data;try{data=await r.json();}catch{throw new Error('The server returned an unexpected response (HTTP '+r.status+').');}
 if(!r.ok)throw new Error(data.error||'Request failed ('+r.status+')');return data;
}
async function checkHealth(){const label=$('#health-label'),chip=$('#health-chip');try{state.health=await http('/api/health');chip.className='health-chip ok';label.textContent='API online';}catch(e){state.health=null;chip.className='health-chip fail';label.textContent='API unreachable';}renderIntegrations();}
async function fetchSpec(){try{state.spec=await http('/api/spec');}catch{state.spec={countries:FALLBACK_COUNTRIES,devices:FALLBACK_DEVICES,utmKeys:Object.keys(UTM_LABELS)};notify('Using offline profile catalog; API connection unavailable.');}renderCountryOptions();renderDeviceOptions();renderDeviceMatrix();}
function renderCounts(){const list=state.store.campaigns,hosts=new Set(list.map(c=>{try{return new URL(c.targetUrl).hostname}catch{return ''}}).filter(Boolean));$('#metric-campaigns').textContent=list.length;$('#metric-websites').textContent=hosts.size;$('#side-campaigns').textContent=list.length;}
function renderRuns(){const raw=state.runs;
 $('#metric-runs').textContent=raw?raw.length:'—';
 const completed=raw?.filter(r=>['success','failure','cancelled'].includes(r.conclusion))||[];
 $('#metric-rate').textContent=completed.length?Math.round(completed.filter(r=>r.conclusion==='success').length/completed.length*100)+'%':'—';
 $('#runs-count').textContent=raw?raw.length+' real runs':'Requires authenticated GitHub API';
 const content=raw?.length?'<div class="record-list">'+raw.map(rowRun).join('')+'</div>':emptyMarkup(raw?'No workflow executions found.':'Connect your API key to retrieve actual GitHub workflow history.');
 $('#run-list').innerHTML=content;
 $('#overview-runs').innerHTML=raw?.length?'<div class="record-list">'+raw.slice(0,4).map(rowRun).join('')+'</div>':emptyMarkup(raw?'No runs executed yet.':'No real run data connected yet.');
 const chart=$('#activity-chart');
 if(!raw?.length){chart.innerHTML='<div class="chart-empty"><div class="empty-icon">⌁</div><strong>No fabricated data here</strong><span>Live GitHub workflow results will appear as soon as your first authorized test runs.</span></div>';return;}
 const last=[...raw].reverse().slice(-12),max=1;
 chart.innerHTML=last.map(r=>{const [klass]=displayStatus(r.conclusion||r.status);return '<div title="'+encode((r.conclusion||r.status)+' • '+time(r.createdAt))+'" class="chart-bar '+(klass==='failure'?'failed':klass==='pending'?'pending':'')+'" style="height:'+(r.conclusion==='success'?64:r.conclusion==='failure'?43:28)+'%" data-label="'+encode(new Date(r.createdAt).toLocaleDateString([],{month:'short',day:'numeric'}))+'"></div>';}).join('');
}
function rowRun(r){const [cls,label]=displayStatus(r.conclusion||r.status);return '<div class="record-row"><span class="record-icon">◷</span><div class="record-desc"><b>Workflow #'+encode(r.id)+'</b><small>'+encode(time(r.createdAt))+' · Attempt '+encode(r.attempt||1)+'</small></div><span class="status '+cls+'">'+encode(label)+'</span><a class="link-button" href="'+encode(r.url||'#')+'" target="_blank" rel="noopener noreferrer">Open ↗</a></div>';}
function emptyMarkup(msg){return '<div class="list-empty"><b>Nothing to show yet.</b><small>'+encode(msg)+'</small></div>';}
async function refreshRuns(){if(!state.apiKey){state.runs=null;renderRuns();return;}const btn=$('#refresh-runs');btn.disabled=true;try{const res=await http('/api/runs',{auth:true});state.runs=res.runs||[];notify('Workflow statuses refreshed.');}catch(e){state.runs=null;notify('Unable to load workflows: '+e.message);}finally{btn.disabled=false;renderRuns();}}
function renderCampaigns(){const list=state.store.campaigns;$('#campaign-list-count').textContent=list.length+' campaign'+(list.length===1?'':'s');$('#campaign-list').innerHTML=list.length?'<div class="record-list">'+[...list].reverse().map(c=>'<div class="record-row"><span class="record-icon">◫</span><div class="record-desc"><b>'+encode(c.name)+'</b><small>'+encode(c.targetUrl)+' · '+encode(c.sessions)+' sessions · '+encode(time(c.updatedAt))+'</small></div><button class="link-button" data-edit="'+encode(c.id)+'">Edit ↗</button><button class="link-button" data-export-campaign="'+encode(c.id)+'">Export ↓</button><button class="link-button delete-button" data-delete-campaign="'+encode(c.id)+'">Remove</button></div>').join('')+'</div>':emptyMarkup('Save your first campaign in the New Test builder.');}

function normalizeSiteDomain(input){
 const trimmed=String(input||'').trim();
 if(!trimmed)throw new Error('Enter the website domain first.');
 let url;try{url=new URL(trimmed.includes('://')?trimmed:'https://'+trimmed)}catch{throw new Error('Enter a valid public website hostname.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||
  /^(localhost|.+\.localhost|.+\.local|.+\.internal|.+\.test|.+\.invalid|.+\.example)$/i.test(url.hostname)||
  /^\d/.test(url.hostname)||url.hostname.includes(':'))throw new Error('Only public HTTPS domain names can be verified.');
 return {hostname:url.hostname,origin:url.origin};
}
function renderSiteOptions(){
 const sel=$('#plan-site-select');if(!sel)return;
 const previous=sel.value;
 const verified=state.store.sites.filter(site=>site.status==='verified');
 sel.innerHTML='<option value="">Choose a verified website…</option>'+
  verified.map(site=>'<option value="'+encode(site.hostname)+'">'+encode(site.hostname)+'</option>').join('');
 if(verified.some(site=>site.hostname===previous))sel.value=previous;
 renderSelectedSiteStatus();
}
function renderSelectedSiteStatus(){
 const status=$('#site-selection-status');if(!status)return;
 const site=state.store.sites.find(s=>s.hostname===$('#plan-site-select').value&&s.status==='verified');
 if(!site){status.textContent='Add and verify a website in Websites before creating a live test.';status.className='field-help';return;}
 const g=site.ga4||{};
 const summary=g.measurementIds?.length?' · GA4 ID detected: '+g.measurementIds.join(', '):g.tagManagerIds?.length?' · Google Tag Manager detected (GA4 ID not visible)':' · GA4 not detected in initial HTML';
 status.textContent='✓ DNS TXT verified on '+time(site.verifiedAt)+summary+'. Ownership is checked again before each test.';
 status.className='field-help verified';
}
function selectVerifiedSite(host,{resetUrl=true}={}){
 const site=state.store.sites.find(s=>s.hostname===host&&s.status==='verified');
 if(!site){notify('Verify this domain in Websites before creating tests.');return false;}
 renderSiteOptions();
 $('#plan-site-select').value=site.hostname;
 if(resetUrl)$('#plan-url').value=site.origin+'/';
 const detected=site.ga4?.measurementIds?.[0];
 if(detected&&!$('#ga-measurement').value.trim())$('#ga-measurement').value=detected;
 renderSelectedSiteStatus();renderBrief();
 return true;
}
function updateSiteProof(){
 let host='your-domain.com';
 try{host=normalizeSiteDomain($('#site-domain').value).hostname}catch{}
 $('#site-dns-name').value='_visitorlab.'+host;
 $('#site-dns-value').value='visitorlab-verification='+state.siteToken;
}
function resetSiteSetup(){
 state.siteToken=freshToken();$('#site-domain').value='';$('#site-authorized').checked=false;
 $('#site-verify-result').textContent='';$('#site-verify-result').className='inline-result';
 updateSiteProof();$('#site-domain').focus();
}
function loadSiteSetup(host){
 const site=state.store.sites.find(s=>s.hostname===host);if(!site)return;
 state.siteToken=site.verificationToken;$('#site-domain').value=site.hostname;
 $('#site-authorized').checked=site.authorized===true;updateSiteProof();nav('websites');
 $('#site-verify-result').textContent='Record loaded for '+site.hostname+'. Confirm the TXT value is published, then verify.';
 $('#site-verify-result').className='inline-result';
}
function saveSiteSetup(){
 if(!$('#site-authorized').checked)throw new Error('Confirm that you own this website or have written permission to test it.');
 const {hostname,origin}=normalizeSiteDomain($('#site-domain').value);
 const old=state.store.sites.find(s=>s.hostname===hostname);
 const sameToken=old?.verificationToken===state.siteToken;
 const site={hostname,origin,verificationToken:state.siteToken,authorized:true,verificationMethod:'dns_txt',
  status:sameToken?old.status:'pending',verifiedAt:sameToken?old.verifiedAt:null,
  ga4:sameToken?old.ga4:null,createdAt:old?.createdAt||new Date().toISOString()};
 state.store.sites=state.store.sites.filter(s=>s.hostname!==hostname);
 state.store.sites.push(site);save();
 return site;
}
async function verifySiteSetup(){
 let site;
 try{site=saveSiteSetup()}catch(e){$('#site-verify-result').textContent=e.message;$('#site-verify-result').className='inline-result bad';return;}
 const button=$('#site-verify');button.disabled=true;button.textContent='Checking DNS + Google tag…';
 $('#site-verify-result').textContent='Checking TXT record at _visitorlab.'+site.hostname+' and inspecting the site…';
 $('#site-verify-result').className='inline-result';
 try{
  const response=await http('/api/site-verify',{method:'POST',auth:true,
   body:{targetUrl:site.origin+'/',verificationToken:site.verificationToken,authorized:true}});
  if(response?.verification?.verified!==true)throw new Error('Domain could not be verified.');
  site.status='verified';site.verifiedAt=response.verification.checkedAt;site.ga4=response.ga4||null;
  save();
  selectVerifiedSite(site.hostname);
  const ga=site.ga4||{};
  const message=ga.measurementIds?.length
   ?'GA4 Measurement ID detected: '+ga.measurementIds.join(', ')+'. Pre-filled in new test campaigns; test event sending remains disabled unless you opt in.'
   :ga.tagManagerIds?.length
   ?'Tag Manager detected: '+ga.tagManagerIds.join(', ')+'. GA4 Measurement ID is not visible in the initial HTML.'
   :'GA4 Measurement ID was not detected in static HTML; runtime-loaded tags may not be visible.';
  $('#site-verify-result').textContent='✓ DNS verified for '+site.hostname+'. '+message+
   ' This does not prove Google Analytics is receiving data.';
  $('#site-verify-result').className='inline-result ok';
 }catch(e){
  site.status='pending';site.verifiedAt=null;site.ga4=null;save();
  $('#site-verify-result').textContent='Verification pending: '+e.message+
    '. Save the DNS setup and retry after publishing the TXT record. Connect the API key under Integrations if needed.';
  $('#site-verify-result').className='inline-result bad';
 }finally{button.disabled=false;button.textContent='Verify TXT & detect GA4 ↗';}
}
function renderWebsites(){
 const list=state.store.sites||[];
 $('#website-list').innerHTML=list.length?'<div class="record-list">'+list.map(site=>{
  const verified=site.status==='verified',ga=site.ga4||{};
  const gaText=ga.measurementIds?.length?'GA4 tag: '+ga.measurementIds.join(', '):
   ga.tagManagerIds?.length?'GTM: '+ga.tagManagerIds.join(', ')+' (GA4 ID not visible)':
   verified?'GA4 ID not detected in HTML':'GA4 not yet scanned';
  return '<div class="record-row site-record"><span class="record-icon">◎</span>'+
   '<div class="record-desc"><b>'+encode(site.hostname)+'</b><small>DNS TXT · '+(verified?'Verified '+encode(time(site.verifiedAt)):'Awaiting TXT verification')+'</small>'+
   '<div class="site-tag-status">'+encode(gaText)+'</div></div>'+
   '<span class="status '+(verified?'success':'pending')+'">'+(verified?'Verified':'Pending')+'</span>'+
   '<div class="site-record-actions"><button class="link-button" data-site-check="'+encode(site.hostname)+'">'+(verified?'Recheck DNS & GA4':'Verify TXT')+'</button>'+
   (verified?'<button class="link-button" data-site-use="'+encode(site.hostname)+'">Create test →</button>':'')+
   '<button class="link-button" data-site-remove="'+encode(site.hostname)+'">Remove</button></div></div>';
 }).join('')+'</div>':emptyMarkup('No websites registered yet. Add your domain and publish the TXT record shown above.');
}
function renderDeviceMatrix(){const devs=state.spec?.devices||FALLBACK_DEVICES;const sample={desktop:['Desktop','Chromium · Firefox · WebKit'],iphone:['iOS viewport','Touch · WebKit-style dimensions'],android:['Android viewport','Mobile touch profile'],ipad:['Tablet landscape/portrait','Touch · retina viewport'],tablet:['Android tablet','Tablet touch profile']};$('#device-cards').innerHTML=Object.entries(devs).map(([key,d])=>'<div class="panel device-card"><div class="device-glyph">'+DEVICE_ICON[key]+'</div><h3>'+encode(d.name)+'</h3><p>'+encode(sample[key]?.[1]||'Playwright browser emulation profile')+'</p><small>'+encode((d.class||'device').toUpperCase())+' TEST PROFILE</small></div>').join('');}
function renderCountryOptions(){const countries=state.spec?.countries||FALLBACK_COUNTRIES;$('#country-options').innerHTML=Object.entries(countries).map(([code,c])=>'<button type="button" data-country="'+code+'" class="choice '+(state.countryCodes.includes(code)?'selected':'')+'" aria-pressed="'+state.countryCodes.includes(code)+'"><span class="flag">'+(FLAG[code]||'🌍')+'</span><b>'+encode(c.name)+'</b><span class="tick">✓</span></button>').join('');}
function renderDeviceOptions(){const devs=state.spec?.devices||FALLBACK_DEVICES;$('#device-options').innerHTML=Object.entries(devs).map(([key,d])=>'<button type="button" data-device="'+key+'" class="choice device '+(state.devices.includes(key)?'selected':'')+'" aria-pressed="'+state.devices.includes(key)+'"><span>'+DEVICE_ICON[key]+'</span><div><b>'+encode(d.name)+'</b><small>'+encode(d.class||'device')+'</small></div><span class="tick">✓</span></button>').join('');}
function renderWizard(){const tabs=['Website','Audience','Execution','Analytics','Review'];$('#wizard-track').innerHTML=tabs.map((label,i)=>'<button type="button" class="wizard-tab '+(i===state.step?'active':i<state.step?'done':'')+'" data-wizard-tab="'+i+'"><span class="stepnum">'+(i<state.step?'✓':(i+1))+'</span><span>'+label+'</span></button>').join('');$$('.step-card').forEach((el,i)=>el.classList.toggle('active',i===state.step));$('#step-back').disabled=state.step===0;$('#step-next').style.display=state.step===4?'none':'';$('#step-next').innerHTML=state.step===3?'Review test <span>→</span>':'Continue <span>→</span>';if(state.step===4)renderReview();}
function renderUtm(){const grid=$('#utm-fields');grid.innerHTML=Object.entries(UTM_LABELS).map(([key,label])=>'<div><label for="'+key+'">'+label.toUpperCase()+'</label><input id="'+key+'" data-utm="'+key+'" maxlength="80" placeholder="'+(key==='utm_source'?'visitorlab':key==='utm_medium'?'synthetic_test':'Optional')+'"/></div>').join('');}
function parseNumber(id,min,max){const raw=$('#'+id).value,n=Number(raw);if(raw.trim()===''||!Number.isInteger(n)||n<min||n>max)throw new Error(id.replace('plan-','').replaceAll('-',' ')+' must be between '+min+' and '+max+'.');return n;}
function readPlan(){
 const selected=$('#plan-site-select').value;
 const site=state.store.sites.find(x=>x.hostname===selected&&x.status==='verified'&&x.authorized===true);
 if(!site)throw new Error('Choose a DNS-verified website. Add and verify the domain in Websites first.');
 let url;try{url=new URL($('#plan-url').value.trim()||site.origin+'/');}catch{throw new Error('Enter a valid HTTPS page on your verified website.');}
 if(url.protocol!=='https:'||url.hostname!==site.hostname||url.username||url.password||url.port)
  throw new Error('Test URL must use HTTPS and match the selected verified website host exactly.');
 if(!state.countryCodes.length||!state.devices.length)throw new Error('Select at least one country and device profile.');
 const analyticsEnabled=$('#ga-enabled').checked,measurement=$('#ga-measurement').value.trim().toUpperCase();
 if(analyticsEnabled&&!/^G-[A-Z0-9]{5,20}$/.test(measurement))throw new Error('Enter a valid GA4 Measurement ID, such as G-XXXXXXXX.');
 const utm={};$$('[data-utm]').forEach(el=>{if(el.value.trim())utm[el.dataset.utm]=el.value.trim()});
 return {name:$('#plan-name').value.trim()||'Website QA test',targetUrl:url.toString(),authorized:true,
  verificationMethod:'dns_txt',verificationToken:site.verificationToken,
  countries:[...state.countryCodes],devices:[...state.devices],browser:$('#plan-browser').value,
  sessions:parseNumber('plan-sessions',1,25),concurrency:parseNumber('plan-concurrency',1,3),
  intervalSeconds:parseNumber('plan-interval',6,120),dwellSeconds:parseNumber('plan-dwell',8,60),
  maxPages:parseNumber('plan-depth',1,4),
  interactions:{scroll:$('#plan-scroll').checked,navigate:$('#plan-navigate').checked,hover:$('#plan-hover').checked,checkImages:$('#plan-images').checked},
  analytics:{enabled:analyticsEnabled,measurementId:analyticsEnabled?measurement:'',utm}};
}
function renderBrief(){const url=$('#plan-url').value.trim();$('#brief-name').textContent=$('#plan-name').value.trim()||'New test campaign';$('#brief-sessions').textContent=$('#plan-sessions').value||'0';$('#brief-url').textContent=(url?(()=>{try{return new URL(url).hostname}catch{return 'Invalid URL'}})():'Not set');$('#brief-countries').textContent=state.countryCodes.length+' profiles';$('#brief-devices').textContent=state.devices.length+' profiles';$('#brief-browser').textContent=($('#plan-browser').value||'chromium').replace(/^./,x=>x.toUpperCase());$('#brief-ga4').textContent=$('#ga-enabled').checked?($('#ga-measurement').value||'Not set'):'Disabled';$('#ga-fields').classList.toggle('enabled',$('#ga-enabled').checked);}
function renderReview(){let cfg;try{cfg=readPlan();}catch(e){$('#review-summary').innerHTML='<div class="inline-result bad">'+encode(e.message)+'</div>';return;}
 const rows=[['Campaign',cfg.name],['Target',new URL(cfg.targetUrl).hostname],['Sessions',cfg.sessions],['Concurrent browsers',cfg.concurrency],['Start interval',cfg.intervalSeconds+' sec'],['Country profiles',cfg.countries.join(', ')],['Devices',cfg.devices.join(', ')],['Browser',cfg.browser],['Maximum pages',cfg.maxPages],['GA4',cfg.analytics.enabled?cfg.analytics.measurementId:'Disabled']];$('#review-summary').innerHTML='<div class="review-grid">'+rows.map(([key,val])=>'<div><span>'+encode(key)+'</span><b>'+encode(val)+'</b></div>').join('')+'</div>';}
function showResult(msg,ok=false){const el=$('#review-message');el.textContent=msg;el.className='inline-result '+(ok?'ok':'bad');}
function download(name,obj){const blob=new Blob([JSON.stringify(obj,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function saveCampaign(){let plan=readPlan();const id=state.campaignId||newId(),now=new Date().toISOString();const old=state.store.campaigns.find(x=>x.id===id);const record={...plan,id,createdAt:old?.createdAt||now,updatedAt:now};state.store.campaigns=state.store.campaigns.filter(x=>x.id!==id);state.store.campaigns.push(record);state.campaignId=id;save();notify('Campaign saved to this browser.');return record;}
function loadCampaign(id){const item=state.store.campaigns.find(x=>x.id===id);if(!item)return;state.campaignId=item.id;$('#plan-name').value=item.name;$('#plan-url').value=item.targetUrl||'';renderSiteOptions();try{const host=item.siteHostname||new URL(item.targetUrl).hostname;
 if(state.store.sites.some(s=>s.hostname===host&&s.status==='verified'))$('#plan-site-select').value=host;}catch{}renderSelectedSiteStatus();state.countryCodes=[...item.countries];state.devices=[...item.devices];$('#plan-browser').value=item.browser;$('#plan-sessions').value=item.sessions;$('#plan-concurrency').value=item.concurrency;$('#plan-interval').value=item.intervalSeconds;$('#plan-dwell').value=item.dwellSeconds;$('#plan-depth').value=item.maxPages;$('#plan-scroll').checked=item.interactions.scroll;$('#plan-navigate').checked=item.interactions.navigate;$('#plan-hover').checked=item.interactions.hover;$('#plan-images').checked=item.interactions.checkImages;$('#ga-enabled').checked=item.analytics?.enabled===true;$('#ga-measurement').value=item.analytics?.measurementId||'';$$('[data-utm]').forEach(el=>el.value=item.analytics?.utm?.[el.dataset.utm]||'');renderCountryOptions();renderDeviceOptions();renderBrief();state.step=0;renderWizard();nav('builder');notify('Campaign loaded for editing.');}
function renderReports(){const reports=state.store.reports;$('#report-count').textContent=reports.length;const s=reports.reduce((t,r)=>t+(r.summary?.completed||0),0),passed=reports.reduce((t,r)=>t+(r.summary?.passed||0),0);$('#report-sessions').textContent=s;$('#report-passed').textContent=passed;const p95=reports.flatMap(r=>r.sessions?.flatMap(x=>x.pages?.map(p=>p.durationMs)||[])||[]).sort((a,b)=>a-b);$('#report-p95').textContent=p95.length?p95[Math.ceil(p95.length*.95)-1]+'ms':'—';$('#report-list').innerHTML=reports.length?'<div class="record-list">'+[...reports].reverse().map((r,i)=>'<div class="record-row"><span class="record-icon">⌁</span><div class="record-desc"><b>'+encode(r.plan?.name||'Imported test report')+'</b><small>'+encode(r.plan?.runId||'Unknown run')+' · '+encode(r.summary?.completed||0)+' sessions · '+encode(time(r.summary?.finishedAt))+'</small></div><span class="status '+((r.summary?.failed||0)>0?'failure':'success')+'">'+encode(r.summary?.passed||0)+' passed</span><button class="link-button" data-export-report="'+encode(r.plan?.runId||'')+'">Export ↓</button></div>').join('')+'</div>':emptyMarkup('Import a real JSON report downloaded from a completed Playwright worker run.');}

function renderInspections(){
 const list=state.store.inspections||[];
 const label=$('#inspection-count'),container=$('#inspection-list');
 if(!label||!container)return;
 label.textContent=list.length+' verified inspection'+(list.length===1?'':'s');
 if(!list.length){container.innerHTML=emptyMarkup('Use Run live site inspection in the campaign builder. A verified website and API access are required.');return;}
 container.innerHTML='<div class="record-list">'+[...list].reverse().map(a=>{
  const issues=(a.findings||[]).filter(f=>['high','medium'].includes(f.level)).length;
  const observations=a.observations||{};
  return '<div class="record-row"><span class="record-icon">◎</span><div class="record-desc"><b>'+encode(observations.title||a.target||'Verified site')+'</b><small>'+encode(a.target||'')+' · HTTP '+encode(a.status)+' · '+encode(a.durationMs)+' ms · '+encode(time(a.timestamp))+'</small>'+
   '<details><summary>'+issues+' prioritized finding'+(issues===1?'':'s')+' · '+encode(a.findings?.length||0)+' total observations</summary><div class="inspection-findings">'+
   (a.findings||[]).map(f=>'<p><b>'+encode(f.level.toUpperCase())+': '+encode(f.code)+'</b> '+encode(f.message)+'</p>').join('')+'</div></details></div>'+
   '<span class="status '+(a.ok?'success':'failure')+'">'+(a.ok?'HTTP OK':'HTTP FAIL')+'</span>'+
   '<button class="link-button" data-export-inspection="'+encode(a.runId)+'">Export ↓</button></div>';
 }).join('')+'</div>';
}
function saveDraft(){
 const now=new Date().toISOString(),id=state.campaignId||newId();
 const original=state.store.campaigns.find(c=>c.id===id);
 const utm={};Array.from(document.querySelectorAll('[data-utm]')).forEach(el=>{if(el.value.trim())utm[el.dataset.utm]=el.value.trim()});
 const numberOr=(id,fallback)=>{const n=Number($('#'+id).value);return Number.isFinite(n)?n:fallback;};
 const plan={
  id,name:$('#plan-name').value.trim()||'Untitled draft',targetUrl:$('#plan-url').value.trim(),
  siteHostname:$('#plan-site-select').value,authorized:!!state.store.sites.find(s=>s.hostname===$('#plan-site-select').value&&s.status==='verified'),
  verificationMethod:'dns_txt',verificationToken:state.store.sites.find(s=>s.hostname===$('#plan-site-select').value)?.verificationToken||'',
  countries:[...state.countryCodes],devices:[...state.devices],browser:$('#plan-browser').value,
  sessions:numberOr('plan-sessions',6),concurrency:numberOr('plan-concurrency',1),
  intervalSeconds:numberOr('plan-interval',8),dwellSeconds:numberOr('plan-dwell',15),
  maxPages:numberOr('plan-depth',2),
  interactions:{scroll:$('#plan-scroll').checked,navigate:$('#plan-navigate').checked,
   hover:$('#plan-hover').checked,checkImages:$('#plan-images').checked},
  analytics:{enabled:$('#ga-enabled').checked,measurementId:$('#ga-measurement').value.trim().toUpperCase(),utm},
  draft:true,createdAt:original?.createdAt||now,updatedAt:now
 };
 state.campaignId=id;state.store.campaigns=state.store.campaigns.filter(x=>x.id!==id);state.store.campaigns.push(plan);
 save();notify('Draft saved locally. Verification is required before live testing.');
 return plan;
}
function renderIntegrations(){const h=state.health;const statuses=[['Vercel service',!!h?.ok],['API configured on server',!!h?.security?.authConfigured],['Workspace session authenticated',state.authenticated],['GitHub dispatch token',!!h?.security?.workflowConfigured],['GA4 Measurement Protocol',!!h?.security?.ga4Configured],['Browser worker','via GitHub Actions'],['DGX intelligence','optional, private']];$('#service-status').innerHTML=statuses.map(([name,ready])=>'<div class="service-line"><span>'+encode(name)+'</span><span class="status '+(ready===true?'success':ready===false?'failure':'neutral')+'">'+(ready===true?'Configured':ready===false?'Not configured':encode(ready))+'</span></div>').join('');$('#settings-token').value=state.apiKey;}
function wireEvents(){document.addEventListener('click',e=>{
 const route=e.target.closest('[data-route]');if(route){nav(route.dataset.route);return;}
 const siteRecheck=e.target.closest('[data-site-check]');if(siteRecheck){loadSiteSetup(siteRecheck.dataset.siteCheck);void verifySiteSetup();return;}
 const siteUse=e.target.closest('[data-site-use]');if(siteUse){if(selectVerifiedSite(siteUse.dataset.siteUse)){nav('builder');state.step=0;renderWizard();}return;}
 const siteRemove=e.target.closest('[data-site-remove]');if(siteRemove){if(confirm('Remove '+siteRemove.dataset.siteRemove+' from this browser? Existing campaigns will require a registered verified domain.')){state.store.sites=state.store.sites.filter(x=>x.hostname!==siteRemove.dataset.siteRemove);save();notify('Website removed locally.');}return;}
 const tab=e.target.closest('[data-wizard-tab]');if(tab){const n=Number(tab.dataset.wizardTab);if(n===4){try{readPlan();}catch(err){notify(err.message);return;}}state.step=n;renderWizard();return;}
 const country=e.target.closest('[data-country]');if(country){const code=country.dataset.country;if(state.countryCodes.includes(code)){if(state.countryCodes.length>1)state.countryCodes=state.countryCodes.filter(c=>c!==code);else notify('Select at least one country.');}else if(state.countryCodes.length<8)state.countryCodes.push(code);else notify('Maximum 8 countries.');renderCountryOptions();renderBrief();return;}
 const device=e.target.closest('[data-device]');if(device){const d=device.dataset.device;if(state.devices.includes(d)){if(state.devices.length>1)state.devices=state.devices.filter(x=>x!==d);else notify('Select at least one device.');}else if(state.devices.length<5)state.devices.push(d);else notify('Maximum 5 devices.');renderDeviceOptions();renderBrief();return;}
 const edit=e.target.closest('[data-edit]');if(edit){loadCampaign(edit.dataset.edit);return;}
 const exportCampaign=e.target.closest('[data-export-campaign]');if(exportCampaign){const c=state.store.campaigns.find(c=>c.id===exportCampaign.dataset.exportCampaign);if(c){const {id,createdAt,updatedAt,...plan}=c;download('trafficgen-plan-'+id.slice(0,8)+'.json',plan);}return;}
 const del=e.target.closest('[data-delete-campaign]');if(del){if(confirm('Delete this saved campaign from this browser?')){state.store.campaigns=state.store.campaigns.filter(c=>c.id!==del.dataset.deleteCampaign);save();notify('Campaign removed.');}return;}
 const inspectionExport=e.target.closest('[data-export-inspection]');if(inspectionExport){const inspection=(state.store.inspections||[]).find(a=>a.runId===inspectionExport.dataset.exportInspection);if(inspection)download('trafficgen-inspection-'+inspection.runId+'.json',inspection);return;}
 const reportExport=e.target.closest('[data-export-report]');if(reportExport){const report=state.store.reports.find(r=>r.plan?.runId===reportExport.dataset.exportReport);if(report)download('trafficgen-report-'+report.plan.runId+'.json',report);}
 });
 $('#menu-open').onclick=()=>{$('#sidebar').classList.add('open');$('#mobile-backdrop').classList.add('open');};$('#mobile-backdrop').onclick=()=>{$('#sidebar').classList.remove('open');$('#mobile-backdrop').classList.remove('open');};
 $('#step-back').onclick=()=>{state.step=Math.max(0,state.step-1);renderWizard();};$('#step-next').onclick=()=>{if(state.step===3){try{readPlan();}catch(e){notify(e.message);return;}}state.step=Math.min(4,state.step+1);renderWizard();};
 $('#site-create-new').onclick=()=>resetSiteSetup();
 $('#site-domain').addEventListener('input',updateSiteProof);
 $('#site-save').onclick=()=>{try{const site=saveSiteSetup();$('#site-verify-result').textContent='TXT setup saved for '+site.hostname+'. Add the record in your DNS provider, then click Verify TXT & detect GA4.';$('#site-verify-result').className='inline-result ok';}catch(e){$('#site-verify-result').textContent=e.message;$('#site-verify-result').className='inline-result bad';}};
 $('#site-verify').onclick=()=>void verifySiteSetup();
 for(const [button,field] of [['site-copy-name','site-dns-name'],['site-copy-value','site-dns-value']]){
  $('#'+button).onclick=async()=>{try{await navigator.clipboard.writeText($('#'+field).value);notify('TXT record copied.');}catch{notify('Select and copy the text from the field manually.');}};
 }
 $('#plan-site-select').addEventListener('change',()=>{const host=$('#plan-site-select').value;
  if(host)selectVerifiedSite(host);else renderSelectedSiteStatus();
 });
 ['plan-name','plan-url','plan-sessions','plan-browser','ga-measurement','ga-enabled'].forEach(id=>$('#'+id).addEventListener('input',renderBrief));
 $('#wizard-save').onclick=()=>{try{saveDraft();}catch(e){notify(e.message);}};$('#review-save').onclick=()=>{try{saveCampaign();showResult('Campaign saved in this browser.',true);}catch(e){showResult(e.message);}};
 $('#review-export').onclick=()=>{try{const plan=readPlan();download('trafficgen-'+(plan.name.replace(/[^a-z0-9]+/gi,'-').slice(0,35).toLowerCase()||'plan')+'.json',plan);showResult('Downloaded a verified-target configuration. Actual authorization is rechecked at execution.',true);}catch(e){showResult(e.message);}};
 $('#review-verify').onclick=async()=>{let plan;try{plan=readPlan();}catch(e){showResult(e.message);return;}showResult('Checking domain ownership…',true);try{const response=await http('/api/validate',{method:'POST',body:plan,auth:true});showResult('Website verified: '+response.verification.hostname+' at '+time(response.verification.checkedAt),true);}catch(e){showResult('Verification failed: '+e.message);}};

 $('#review-audit').onclick=async()=>{
  let plan;
  try{plan=readPlan();}catch(e){showResult(e.message);return;}
  const button=$('#review-audit');button.disabled=true;button.textContent='Running verified site inspection…';
  showResult('Verifying ownership and fetching one tagged HTTPS page…',true);
  try{
   const response=await http('/api/inspect',{method:'POST',body:plan,auth:true});
   const result=response.audit;
   if(!result||result.kind!=='site_inspection')throw new Error('Unexpected inspection result');
   state.store.inspections=state.store.inspections.filter(x=>x.runId!==result.runId);
   state.store.inspections.push(result);
   state.store.inspections=state.store.inspections.slice(-100);
   save();
   const priorities=result.findings.filter(x=>['high','medium'].includes(x.level));
   showResult('Verified inspection completed: HTTP '+result.status+' · '+result.durationMs+' ms · '+result.observations.title+
    ' · '+priorities.length+' prioritized finding(s). Full report saved in Analytics → Verified site inspections.',true);
  }catch(e){showResult('Site inspection unavailable: '+e.message);}
  finally{button.disabled=false;button.textContent='Run live site inspection ↗';}
 };
 $('#review-dispatch').onclick=async()=>{let plan;try{plan=readPlan();}catch(e){showResult(e.message);return;}if(!confirm('Dispatch '+plan.sessions+' identified synthetic sessions to '+new URL(plan.targetUrl).hostname+'?'))return;showResult('Validating and dispatching test…',true);try{const res=await http('/api/dispatch',{method:'POST',body:plan,auth:true});saveCampaign();showResult('Dispatched run '+res.runId+' to GitHub Actions. Check Run monitor for status.',true);}catch(e){showResult('Dispatch unavailable: '+e.message+'\nIf workflow dispatch is unconfigured, export your plan and commit to plans/active.json on GitHub.');}};
 $('#refresh-runs').onclick=()=>void refreshRuns();$('#refresh-health').onclick=()=>void checkHealth();
 $('#connect-api').onclick=async()=>{const key=$('#settings-token').value.trim();if(!key||key.length<24){$('#api-connection-result').textContent='Enter the 24+ character API key from Vercel.';return;}state.apiKey=key;sessionStorage.setItem(TOKEN_KEY,key);try{const ready=await http('/api/auth-check',{auth:true});$('#api-connection-result').textContent=ready.integrations.githubWorkflow?'API authorized. GitHub workflow connection is ready.':'API authorized. Website verification is available; one-click dispatch still needs GITHUB_WORKFLOW_TOKEN.';$('#api-connection-result').className='inline-result ok';state.authenticated=true;renderIntegrations();if(ready.integrations.githubWorkflow)await refreshRuns();else{state.runs=null;renderRuns();}}catch(e){sessionStorage.removeItem(TOKEN_KEY);state.apiKey='';state.authenticated=false;renderIntegrations();$('#api-connection-result').textContent='API authorization failed: '+e.message;$('#api-connection-result').className='inline-result bad';}notify('Workspace connection checked.');};
 $('#disconnect-api').onclick=()=>{state.apiKey='';state.authenticated=false;sessionStorage.removeItem(TOKEN_KEY);$('#settings-token').value='';state.runs=null;renderRuns();$('#api-connection-result').textContent='Key cleared from this tab.';notify('Disconnected.');};
 $('#toggle-token').onclick=()=>{const input=$('#settings-token');input.type=input.type==='password'?'text':'password';$('#toggle-token').textContent=input.type==='password'?'Show':'Hide';};
 $('#backup-workspace').onclick=()=>download('trafficgen-workspace-backup.json',state.store);
 $('#restore-workspace').onclick=()=>$('#workspace-file').click();
 $('#workspace-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(file.size>2_000_000)throw new Error('Workspace backup exceeds 2 MB');
   const data=JSON.parse(await file.text());
   if(!data||!Array.isArray(data.campaigns)||!Array.isArray(data.reports))throw new Error('Not a TrafficGen workspace backup');
   const campaigns=data.campaigns.slice(-500);
   const reports=data.reports.slice(-100);
   const inspections=(Array.isArray(data.inspections)?data.inspections:[]).slice(-100);
   const sites=(Array.isArray(data.sites)?data.sites:[]).slice(-100);
   if(campaigns.some(x=>!x||typeof x.id!=='string'||typeof x.name!=='string')||
      reports.some(x=>!x||typeof x.summary!=='object'||!x.plan)||
      inspections.some(x=>!x||x.kind!=='site_inspection'||typeof x.runId!=='string')||
      sites.some(x=>!x||typeof x.hostname!=='string'||typeof x.verificationToken!=='string'))
     throw new Error('Backup contains invalid records');
   if(!confirm('Restore '+campaigns.length+' campaigns, '+reports.length+' browser reports and '+inspections.length+' site inspections? Existing local data will be replaced.'))return;
   state.store={campaigns,reports,inspections,sites};state.campaignId=null;save();
   notify('Workspace successfully restored from JSON.');
  }catch(err){notify('Restore failed: '+err.message);}
  finally{e.target.value='';}
 });
 $('#clear-workspace').onclick=()=>{if(confirm('Erase locally saved campaigns and imported reports? The GitHub repository and external test results are unaffected.')){state.store=emptyStorage();save();notify('Local workspace cleared.');}};
 $('#import-report').onclick=()=>$('#report-file').click();$('#report-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>3_000_000)throw Error('Report exceeds 3 MB');const data=JSON.parse(await file.text());if(typeof data!=='object'||!data||!Array.isArray(data.sessions)||typeof data.summary!=='object'||!data.plan?.runId)throw Error('Not a recognized TrafficGen worker report.');state.store.reports=state.store.reports.filter(r=>r.plan.runId!==data.plan.runId);state.store.reports.push(data);save();notify('Actual worker report imported.');}catch(err){notify('Report import failed: '+err.message);}finally{e.target.value='';}});
 $('#export-reports').onclick=()=>download('trafficgen-worker-reports.json',state.store.reports);
}
async function init(){renderUtm();updateSiteProof();renderSiteOptions();renderWizard();renderBrief();renderCounts();renderCampaigns();renderWebsites();renderSiteOptions();renderRuns();renderReports();renderInspections();renderIntegrations();wireEvents();nav(location.hash.slice(1)||'overview');await Promise.all([checkHealth(),fetchSpec()]);if(state.apiKey){try{await http('/api/auth-check',{auth:true});state.authenticated=true;}catch{state.authenticated=false;state.apiKey='';sessionStorage.removeItem(TOKEN_KEY);}renderIntegrations();}}
window.addEventListener('hashchange',()=>nav(location.hash.slice(1)||'overview'));
init().catch(e=>{console.error(e);notify('Dashboard initialization failed: '+e.message);});
