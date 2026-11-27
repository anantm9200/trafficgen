"""Chromium DOM/visual smoke test using an in-page API fixture.
No external navigation and no production website traffic.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'command-center/index.html').read_text()
css=(ROOT/'command-center/styles.css').read_text()
js=(ROOT/'command-center/app.js').read_text()
JS_FIXTURE=r'''
const memory=new Map(); Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},configurable:true});
Object.defineProperty(window,'crypto',{value:{randomUUID:()=> '11111111-2222-4333-8444-'+String(Math.floor(Math.random()*1000000000000)).padStart(12,'0')},configurable:true});
window.__campaigns=[];window.__runs=[];
window.fetch=async (url,opts={})=>{
 if(url.startsWith('/api/campaign-gateway?'))url='/api/'+new URLSearchParams(url.split('?')[1]).get('route');
 const method=opts.method||'GET';let data={ok:true};
 if(url==='/api/campaigns'&&method==='GET')data.campaigns=window.__campaigns;
 else if(url==='/api/runs')data.runs=window.__runs;
 else if(url==='/api/insights'){const completed=window.__runs.reduce((n,r)=>n+(r.report?.summary?.completed||0),0);const passed=window.__runs.reduce((n,r)=>n+(r.report?.summary?.passed||0),0);data.summary={completed,successRatePercent:completed?Math.round(100*passed/completed):null}}
 else if(url==='/api/qa/health')data={ok:true,qaConfigured:false,reportingConfigured:false};
 else if(url==='/api/campaigns'&&method==='POST'){
  const raw=JSON.parse(opts.body);const item={id:crypto.randomUUID(),status:'draft',draft:raw};
  window.__campaigns.push(item);data.campaign=item;
 }
 else if(url.includes('/status')&&method==='PATCH'){
  const id=url.split('/')[3];const found=window.__campaigns.find(x=>x.id===id);
  found.status=JSON.parse(opts.body).status;data.campaign=found;
 }
 else if(url.endsWith('/run')&&method==='POST'){
  const item={id:crypto.randomUUID(),status:'queued',sessionBudget:1,createdAt:new Date().toISOString(),startedAt:null,report:null};
  window.__runs.push(item);data.run=item;data.replayed=false;
 }
 return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}})
};
'''

def check(w,h,label):
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--no-proxy-server'])
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded');page.add_style_tag(content=css)
  page.evaluate(JS_FIXTURE+"\nvoid 0;");page.evaluate(js)
  assert page.locator('h1').inner_text().startswith('Execution intelligence.')
  assert page.locator('#activity-chart').count()==1
  assert page.locator('#qa-evidence-panel').count()==0
  page.locator('.rail a[href="#settings"]').click()
  page.locator('#settings').wait_for(state='visible')
  page.locator('#api-key').fill('local_test_key_1234567890123456789')
  page.locator('#connect').click()
  page.locator('.rail a[href="#create"]').click()
  page.locator('#create').wait_for(state='visible',timeout=3000)
  assert not page.locator('#overview').is_visible()
  page.locator('#create-form [name="name"]').fill('Homepage synthetic QA')
  page.locator('#create-form [name="siteUrl"]').fill('https://example.org')
  assert page.locator('#plan-preview').inner_text().find('example.org')>=0
  page.locator('#schedule-mode').select_option('recurring')
  assert page.locator('#schedule-fields').is_visible()
  page.locator('#schedule-mode').select_option('manual')
  assert not page.locator('#schedule-fields').is_visible()
  page.locator('#add-assert').click()
  page.locator('#add-nav').click()
  page.locator('#journey-steps [data-action="navigate"] input').fill('/about')
  if label=='desktop':page.screenshot(path=str(ROOT/'docs/campaign-builder-desktop.png'),full_page=True)
  page.locator('#create-form button[type="submit"]').click()
  page.locator('#campaign-list .campaign').wait_for(timeout=5000)
  assert page.locator('#campaign-total').inner_text()=='1'
  page.locator('.rail a[href="#overview"]').click()
  page.locator('[data-period="24h"]').click()
  assert page.locator('[data-period="24h"]').get_attribute('class')=='active'
  page.locator('#theme-toggle').click()
  assert page.locator('html').get_attribute('data-theme')=='dark'
  if label=='desktop':page.screenshot(path=str(ROOT/'docs/command-center-dark-desktop.png'),full_page=True)
  page.locator('#theme-toggle').click()
  assert page.locator('html').get_attribute('data-theme')=='light'
  assert page.locator('#campaign-list .campaign').count()==1
  assert page.evaluate('window.__campaigns[0].draft.journey.map(x=>x.action)')==['navigate','assert','navigate']
  page.locator('.rail a[href="#campaigns"]').click()
  page.locator('#campaigns').wait_for(state='visible',timeout=3000)
  page.evaluate("() => {const el=document.querySelector('#campaign-search');el.value='not a real campaign';el.dispatchEvent(new Event('input',{bubbles:true}))}")
  assert page.locator('#campaign-list .campaign').count()==0
  page.evaluate("() => {const el=document.querySelector('#campaign-search');el.value='Homepage';el.dispatchEvent(new Event('input',{bubbles:true}))}")
  assert page.locator('#campaign-list .campaign').count()==1
  page.locator('[data-campaign-filter="active"]').click()
  assert page.locator('#campaign-list .campaign').count()==0
  page.locator('[data-campaign-filter="draft"]').click()
  assert page.locator('#campaign-list .campaign').count()==1
  page.locator('[data-campaign-filter="all"]').click()
  page.locator('#campaign-list button:has-text("Activate")').click()
  page.locator('#campaign-list button:has-text("Run test")').wait_for(timeout=5000)
  page.locator('#campaign-list button:has-text("Run test")').click()
  assert page.locator('#run-dialog').is_visible()
  page.locator('#proof-token').fill('tg_mock_proof_01234567890')
  page.locator('#submit-run').click()
  page.locator('#activity').wait_for(state='visible',timeout=5000)
  page.locator('#run-list .status.queued').wait_for(timeout=5000)
  assert page.locator('#run-total').inner_text()=='1'
  page.evaluate("""() => {const run=window.__runs[0];run.status='completed';run.report={summary:{completed:1,passed:1,pagesVisited:2},sessions:[{index:1,ok:true,device:'desktop',countryCode:'AE',journey:{ok:true,steps:[{step:1,action:'navigate',path:'/',ok:true,durationMs:45},{step:2,action:'assert',ok:true,durationMs:8},{step:3,action:'navigate',path:'/about',ok:true,durationMs:47}]}}]}}""")
  page.locator('#refresh-runs').click()
  page.locator('#run-list button:has-text("Inspect")').click()
  assert page.locator('#report-dialog').is_visible()
  assert page.locator('#report-sessions .step-list li').count()==3
  page.locator('#close-report').click()
  assert not errors,f'Page errors: {errors}'
  page.locator('.rail a[href="#overview"]').click()
  page.locator('#overview').wait_for(state='visible',timeout=3000)
  assert not page.locator('#campaigns').is_visible()
  assert page.locator('#period-run-count').inner_text()=='1'
  assert page.locator('#complete-total').inner_text()=='1'
  assert page.locator('#pass-rate').inner_text()=='100%'
  page.screenshot(path=str(ROOT/f'docs/campaign-lab-{label}.png'),full_page=True)
  viewport_overflow=page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
  assert not viewport_overflow,'Unexpected horizontal overflow'
  print(label, 'campaigns',page.locator('#campaign-list .campaign').count(),'runs',page.locator('#run-list tr').count(),'JS errors',len(errors))
  browser.close()

check(1440,900,'desktop')
check(390,844,'mobile')
