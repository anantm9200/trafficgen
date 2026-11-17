import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import {browse} from '../worker/run.mjs';

test('Playwright browser navigates, hovers and scrolls a locally fulfilled two-page journey',async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({...devices['iPhone 13'],locale:'en-AE',timezoneId:'Asia/Dubai'});
 await context.route('**/*',async route=>{
  const target=new URL(route.request().url());
  if(target.hostname!=='example.org')return route.abort();
  if(target.pathname==='/about')return route.fulfill({status:200,contentType:'text/html',body:'<html><body><h1>About fixture</h1></body></html>'});
  return route.fulfill({status:200,contentType:'text/html',body:'<html><body><nav><a href="/about">About</a></nav><main style="height:1200px"><h1>Safe browser testing fixture</h1></main></body></html>'});
 });
 try{
  const page=await context.newPage();
  const result={pages:[],status:null,error:null,brokenImages:0};
  await browse(page,{targetUrl:'https://example.org/',maxPages:2,dwellSeconds:0,
   interactions:{hover:true,scroll:true,navigate:true,checkImages:true}},result);
  assert.equal(result.pages.length,2);
  assert.ok(result.pages.every(p=>p.status===200));
  assert.equal(new URL(result.pages[1].url).pathname,'/about');
  assert.equal(result.brokenImages,0);
  assert.equal(result.error,null);
 }finally{await context.close();await browser.close();}
});
