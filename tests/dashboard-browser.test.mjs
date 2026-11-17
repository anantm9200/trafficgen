import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
 .replace(/<link[^>]*>/g,'')
 .replaceAll('<script defer type="module" src="/app.js"></script>','');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Dashboard supports draft, inspection, real API errors and workspace restore in Chromium',async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
 const errors=[];page.on('pageerror',x=>errors.push(x.message));
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
    else if(p==='/api/spec')data={ok:true,countries:{AE:{name:'United Arab Emirates'},IN:{name:'India'}},devices:{desktop:{name:'Desktop',class:'desktop'},iphone:{name:'iPhone',class:'mobile'}}};
    else if(p==='/api/auth-check')data={ok:true,integrations:{githubWorkflow:false}};
    else if(!opt.headers?.Authorization){status=401;data={error:'Unauthorized'};}
    else if(p==='/api/validate')data={ok:true,verification:{hostname:'example.org',checkedAt:new Date().toISOString()}};
    else if(p==='/api/inspect')data={ok:true,audit:{
      kind:'site_inspection',runId:'run-inspect-test',mode:'single_verified_http_get',target:'https://example.org/',
      timestamp:new Date().toISOString(),verified:true,status:200,ok:true,durationMs:45,bytes:1024,
      findings:[{level:'medium',code:'MISSING_META_DESCRIPTION',message:'Meta description was not present'}],
      observations:{title:'Example Test Page',images:0,h1Count:1},
      notice:'One tagged server-side request.'
    }};
    else if(p==='/api/dispatch'){status=503;data={error:'GitHub workflow dispatch token not configured'};}
    return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
   };
  });
  await page.addScriptTag({content:js});
  await page.waitForFunction(()=>document.querySelector('#health-label')?.textContent==='API online');
  await page.locator('button[data-route="builder"].primary').first().click();
  await page.locator('#wizard-save').click();
  await page.locator('.nav-link[data-route="campaigns"]').click();
  assert.equal(await page.locator('#campaign-list [data-edit]').count(),1,'Draft must save without URL/authorization');
  await page.locator('#campaign-list [data-edit]').click();
  await page.locator('#plan-url').fill('https://example.org/');
  await page.locator('#plan-authorized').check();
  for(let i=0;i<4;i++)await page.locator('#step-next').click();
  assert.match(await page.locator('#review-summary').innerText(),/example.org/);
  await page.locator('#review-save').click();
  await page.locator('.nav-link[data-route="settings"]').click();
  await page.locator('#settings-token').fill('123456789012345678901234567890');
  await page.locator('#connect-api').click();
  await page.waitForFunction(()=>document.querySelector('#api-connection-result')?.textContent.includes('API authorized'));
  await page.locator('.nav-link[data-route="builder"]').click();
  for(let i=0;i<4;i++)await page.locator('#step-next').click();
  await page.locator('#review-audit').click();
  await page.waitForFunction(()=>document.querySelector('#review-message')?.textContent.includes('Verified inspection completed'));
  await page.locator('.nav-link[data-route="analytics"]').click();
  assert.match(await page.locator('#inspection-list').innerText(),/Example Test Page/);
  await page.locator('#inspection-list details summary').click();
  assert.match(await page.locator('#inspection-list').innerText(),/MISSING_META_DESCRIPTION/);
  await page.locator('.nav-link[data-route="settings"]').click();
  const workspace={campaigns:[{id:'restore-test',name:'Restored fixture campaign',targetUrl:'https://example.org/',sessions:1,
   countries:['AE'],devices:['desktop'],browser:'chromium',interactions:{scroll:true,navigate:true,hover:true,checkImages:true},
   analytics:{enabled:false,utm:{}}}],reports:[],inspections:[]};
  await page.locator('#workspace-file').setInputFiles({
   name:'workspace.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(workspace))
  });
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('restored'));
  await page.locator('.nav-link[data-route="campaigns"]').click();
  assert.match(await page.locator('#campaign-list').innerText(),/Restored fixture campaign/);
  assert.equal(errors.length,0,'Unexpected browser errors: '+errors.join('; '));
 }finally{await browser.close();}
});
