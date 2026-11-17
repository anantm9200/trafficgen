import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/<link[^>]*>/g,'').replaceAll('<script defer type="module" src="/app.js"></script>','');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('Dashboard actually initializes, edits campaigns and checks service in Chromium',async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',x=>errors.push(x.message));
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
   return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  };
 });
 await page.addScriptTag({content:js});
 await page.waitForFunction(()=>document.querySelector('#health-label')?.textContent==='API online');
 await page.locator('button[data-route="builder"].primary').first().click();
 await page.locator('#plan-url').fill('https://example.org/');
 await page.locator('#plan-authorized').check();
 await page.locator('#step-next').click();
 await page.locator('#step-next').click();
 await page.locator('#step-next').click();
 await page.locator('#step-next').click();
 assert.match(await page.locator('#review-summary').innerText(),/example.org/);
 await page.locator('#review-save').click();
 await page.locator('.nav-link[data-route="campaigns"]').click();
 assert.equal(await page.locator('#campaign-list [data-edit]').count(),1);
 await page.locator('#campaign-list [data-edit]').click();
 await page.locator('.nav-link[data-route="settings"]').click();
 await page.locator('#settings-token').fill('123456789012345678901234567890');
 await page.locator('#connect-api').click();
 await page.waitForFunction(()=>document.querySelector('#api-connection-result')?.textContent.includes('API authorized'));
 assert.equal(errors.length,0,'Unexpected browser errors: '+errors.join('; '));
 }finally{await browser.close();}
});
