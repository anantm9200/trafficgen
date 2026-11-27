import test from 'node:test';
import assert from 'node:assert/strict';
import {executeSafeJourney} from '../src/journey-runtime.mjs';

const executable=process.env.TG_BROWSER_EXECUTABLE;
test('Chromium DOM executes safe explicit steps with in-memory navigation fixture',
 {skip:!executable&&'Real Chromium executable not configured'},async()=>{
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  let current='https://example.org/';
  const fixture={
   goto:async url=>{current=url;const path=new URL(url).pathname;
    await page.setContent(path==='/about'?'<main><h1 id="about">About test</h1></main>':'<main style="height:4000px"><h1 id="home">Home test</h1></main>');
    return {status:()=>200};},
   url:()=>current,
   locator:selector=>page.locator(selector),
   mouse:page.mouse
  };
  const result=await executeSafeJourney(fixture,{siteUrl:'https://example.org',journey:[
   {action:'navigate',path:'/'},{action:'assert',selector:'#home'},
   {action:'scroll',distancePx:450},{action:'navigate',path:'/about'},
   {action:'assert',selector:'#about'}]});
  assert.equal(result.ok,true);
  assert.equal(result.visitedPages,2);
  assert.equal(result.steps.length,5);
  assert.deepEqual(result.steps.map(s=>s.action),['navigate','assert','scroll','navigate','assert']);
  assert.equal(await page.locator('#about').innerText(),'About test');
 }finally{await browser.close()}
});
