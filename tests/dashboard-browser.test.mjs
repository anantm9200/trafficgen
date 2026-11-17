import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
 .replace(/<link[^>]*>/g,'')
 .replaceAll('<script type="module" src="/app.js"></script>','');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('DNS website enrollment auto-detects GA4 and reuses verified sites across campaigns',async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 try{
  await page.setContent(html);
  await page.addStyleTag({content:css});
  await page.evaluate(()=>{
   const storage=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
   Object.defineProperty(window,'localStorage',{configurable:true,value:storage()});
   Object.defineProperty(window,'sessionStorage',{configurable:true,value:storage()});
   window.fetch=async(p,opt={})=>{
    let status=200,data={ok:true};
    if(p==='/api/health')data={ok:true,security:{authConfigured:true,workflowConfigured:false,ga4Configured:false}};
    else if(p==='/api/spec')data={ok:true,
     countries:{AE:{name:'United Arab Emirates'},IN:{name:'India'}},
     devices:{desktop:{name:'Desktop',class:'desktop'},iphone:{name:'iPhone',class:'mobile'}},
     siteVerify:{endpoint:'POST /api/site-verify'}};
    else if(p==='/api/auth-check')data={ok:true,integrations:{githubWorkflow:false}};
    else if(p==='/api/site-verify'){window.__siteVerifyNoAuth=!opt.headers?.Authorization;data={ok:true,verification:{
      verified:true,method:'dns_txt',hostname:'example.org',checkedAt:new Date().toISOString()
    },ga4:{
      status:'measurement_id_detected',measurementIds:['G-AUTO123456'],tagManagerIds:[],
      method:'static_html',trackingActiveConfirmed:false,
      note:'Measurement ID found in HTML; delivery unverified'
    }};}
    else if(!opt.headers?.Authorization){status=401;data={error:'Unauthorized'};}
    else if(p==='/api/validate')data={ok:true,verification:{verified:true,hostname:'example.org',checkedAt:new Date().toISOString()}};
    else if(p==='/api/inspect')data={ok:true,audit:{
      kind:'site_inspection',runId:'run-inspect-test',mode:'single_verified_http_get',target:'https://example.org/',
      timestamp:new Date().toISOString(),verified:true,status:200,ok:true,durationMs:45,bytes:1024,
      findings:[],observations:{title:'Example Test Page',images:0,h1Count:1},
      ga4:{status:'measurement_id_detected',measurementIds:['G-AUTO123456']},
      notice:'One tagged server-side request.'
    }};
    else if(p==='/api/dispatch'){status=503;data={error:'GitHub workflow dispatch token not configured'};}
    return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
   };
  });
  await page.addScriptTag({content:js});
  await page.waitForFunction(()=>document.querySelector('#health-label')?.textContent==='API online');

  // Register target using DNS TXT and automatically detect GA4 WITHOUT an API key.
  await page.locator('.nav-link[data-route="websites"]').click();
  await page.locator('#site-domain').fill('example.org');
  await page.locator('#site-authorized').check();
  assert.equal(await page.locator('#site-dns-name').inputValue(),'_visitorlab.example.org');
  assert.match(await page.locator('#site-dns-value').inputValue(),/^visitorlab-verification=tg_[A-Za-z0-9_-]{16,}$/);
  await page.locator('#site-save').click();
  assert.match(await page.locator('#website-list').innerText(),/Pending/);
  await page.locator('#site-verify').click();
  await page.waitForFunction(()=>document.querySelector('#site-verify-result')?.textContent.includes('DNS verified'));
  assert.match(await page.locator('#website-list').innerText(),/G-AUTO123456/);
  assert.match(await page.locator('#site-verify-result').innerText(),/does not prove Google Analytics is receiving data/);
  assert.equal(await page.evaluate(()=>window.__siteVerifyNoAuth),true,'TXT verification must not depend on an API bearer key');

  // Existing TXT tokens must be recovered rather than accidentally regenerated.
  const existing=await page.locator('#site-dns-value').inputValue();
  await page.locator('#site-create-new').click();
  await page.locator('#site-domain').fill('example.org');
  await page.locator('#site-authorized').click();
  assert.equal(await page.locator('#site-dns-value').inputValue(),existing);

  // Protected full inspections and execution still require a workspace API key.
  await page.locator('.nav-link[data-route="settings"]').click();
  await page.locator('#settings-token').fill('123456789012345678901234567890');
  await page.locator('#connect-api').click();
  await page.waitForFunction(()=>document.querySelector('#api-connection-result')?.textContent.includes('API authorized'));

  // Return from Integrations to the website list before creating the test.
  await page.locator('.nav-link[data-route="websites"]').click();
  // Campaign builder no longer asks for another token or authorization checkbox.
  await page.locator('#website-list [data-site-use]').click();
  assert.equal(await page.locator('#plan-site-select').inputValue(),'example.org');
  assert.equal(await page.locator('#plan-url').inputValue(),'https://example.org/');
  assert.equal(await page.locator('#ga-measurement').inputValue(),'G-AUTO123456');
  assert.equal(await page.locator('#ga-enabled').isChecked(),false);
  assert.equal(await page.locator('#plan-token').count(),0);
  assert.equal(await page.locator('#plan-authorized').count(),0);

  await page.locator('#wizard-save').click();
  await page.locator('.nav-link[data-route="campaigns"]').click();
  assert.equal(await page.locator('#campaign-list [data-edit]').count(),1);
  await page.locator('#campaign-list [data-edit]').click();
  assert.equal(await page.locator('#plan-site-select').inputValue(),'example.org');
  for(let i=0;i<4;i++)await page.locator('#step-next').click();
  assert.match(await page.locator('#review-summary').innerText(),/example.org/);
  await page.locator('#review-save').click();
  await page.locator('#review-verify').click();
  await page.waitForFunction(()=>document.querySelector('#review-message')?.textContent.includes('Website verified'));
  await page.locator('#review-audit').click();
  await page.waitForFunction(()=>document.querySelector('#review-message')?.textContent.includes('Verified inspection completed'));
  await page.locator('.nav-link[data-route="analytics"]').click();
  assert.match(await page.locator('#inspection-list').innerText(),/Example Test Page/);

  // Restoring a workspace includes verified site metadata.
  await page.locator('.nav-link[data-route="settings"]').click();
  const site={
    hostname:'example.org',origin:'https://example.org',authorized:true,status:'verified',
    verificationMethod:'dns_txt',verificationToken:'tg_1234567890abcdefgh',
    verifiedAt:new Date().toISOString(),ga4:{measurementIds:['G-AUTO123456']}
  };
  const workspace={sites:[site],campaigns:[{id:'restore-test',name:'Restored fixture campaign',
    siteHostname:'example.org',targetUrl:'https://example.org/',sessions:1,countries:['AE'],devices:['desktop'],browser:'chromium',
    interactions:{scroll:true,navigate:true,hover:true,checkImages:true},analytics:{enabled:false,utm:{}}}],
    reports:[],inspections:[]};
  await page.locator('#workspace-file').setInputFiles({
   name:'workspace.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(workspace))
  });
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('restored'));
  await page.locator('.nav-link[data-route="websites"]').click();
  assert.match(await page.locator('#website-list').innerText(),/example.org/);
  await page.locator('.nav-link[data-route="campaigns"]').click();
  assert.match(await page.locator('#campaign-list').innerText(),/Restored fixture campaign/);
  assert.equal(errors.length,0,'Unexpected browser errors: '+errors.join('; '));
 }finally{await browser.close();}
});
