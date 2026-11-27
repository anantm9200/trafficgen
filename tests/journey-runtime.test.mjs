import test from 'node:test';import assert from 'node:assert/strict';
import {executeSafeJourney} from '../src/journey-runtime.mjs';
const campaign={siteUrl:'https://example.org',journey:[{action:'navigate',path:'/'},{action:'scroll',distancePx:500},{action:'assert',selector:'h1'},{action:'dwell',seconds:1}]};
test('executes explicit safe navigation, scroll, assertion and dwell in order',async()=>{
 let url='',actions=[];
 const page={goto:async u=>{url=u;actions.push('navigate');return {status:()=>200}},url:()=>url,
   mouse:{wheel:async()=>actions.push('scroll')},locator:()=>({isVisible:async()=>{actions.push('assert');return true}})};
 const r=await executeSafeJourney(page,campaign,{sleep:async()=>actions.push('dwell')});
 assert.deepEqual(actions,['navigate','scroll','assert','dwell']);
 assert.equal(r.ok,true);assert.equal(r.visitedPages,1);
});
test('halts a journey on HTTP failure without executing subsequent steps',async()=>{
 let wheels=0;
 const page={goto:async()=>({status:()=>429}),url:()=>'',mouse:{wheel:async()=>wheels++}};
 const r=await executeSafeJourney(page,campaign,{sleep:async()=>{}});
 assert.equal(r.ok,false);assert.equal(r.steps.length,1);assert.equal(wheels,0);
});
test('rejects offsite redirect and dangerous path before performing actions',async()=>{
 const page={goto:async()=>({status:()=>200}),url:()=> 'https://external.org/'};
 const r=await executeSafeJourney(page,{...campaign,journey:[{action:'navigate',path:'/'}]});
 assert.equal(r.ok,false);
 await assert.rejects(executeSafeJourney(page,{...campaign,journey:[{action:'navigate',path:'/checkout'}]}));
});
test('navigation emits evidence for each explicit step and marks every navigation synthetic',async()=>{
 let current='https://example.org',calls=[],evidence=[];
 const steps={...campaign,journey:[{action:'navigate',path:'/about'},{action:'assert',selector:'h1'},{action:'navigate',path:'/team'}]};
 const page={goto:async url=>{current=url;calls.push(new URL(url).pathname);return {status:()=>200}},url:()=>current,
  locator:()=>({isVisible:async()=>true})};
 const r=await executeSafeJourney(page,steps,{navigateUrl:url=>url+'?visitorlab_test=1',onNavigation:event=>evidence.push(event)});
 assert.equal(r.ok,true);assert.deepEqual(calls,['/about','/team']);
 assert.equal(evidence.length,2);assert.ok(evidence.every(e=>new URL(e.url).searchParams.get('visitorlab_test')==='1'));
});
test('HTTP failures report their navigation status and stop remaining steps',async()=>{
 let calls=0,seen=[];
 const p={goto:async url=>{calls++;return {status:()=>429}},url:()=> 'https://example.org/'};
 const r=await executeSafeJourney(p,{siteUrl:'https://example.org',journey:[{action:'navigate',path:'/'},{action:'navigate',path:'/about'}]},
  {onNavigation:e=>seen.push(e)});
 assert.equal(r.ok,false);assert.equal(calls,1);assert.equal(seen[0].status,429);
});
