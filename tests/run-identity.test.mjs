import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {compileBrowserPlan} from '../src/campaign-definition.mjs';
import {normalizeForDgx} from '../src/dispatch-bridge.mjs';
import {sameRunIdentity,runFingerprint} from '../src/run-identity.mjs';
const base=()=>normalizeForDgx(compileBrowserPlan({name:'Safely tested site',siteUrl:'https://example.org',sessions:1,concurrency:1,intervalSeconds:8,
 journey:[{action:'navigate',path:'/'},{action:'assert',selector:'h1'}]},
 {runId:randomUUID(),verificationToken:'tg_validOwnerToken1234567890'}));
test('duplicate dispatch with same work allows new proof token and normalization timestamp',()=>{
 const a=base();const b={...a,verificationToken:'tg_rotatedOwnerToken987654321',createdAt:'2026-11-19T00:00:00Z'};
 assert.equal(sameRunIdentity(a,b),true);
 assert.equal(runFingerprint(a).includes(a.verificationToken),false);
});
test('duplicate dispatch cannot reuse same runId with altered site, steps, or measurement mode',()=>{
 const a=base();
 assert.equal(sameRunIdentity(a,{...a,targetUrl:'https://different.example.org/'}),false);
 assert.equal(sameRunIdentity(a,{...a,requestedJourney:[{action:'navigate',path:'/new'}]}),false);
 assert.equal(sameRunIdentity(a,{...a,countries:['US']}),false);
 assert.equal(sameRunIdentity(a,{...a,analytics:{enabled:true}}),false);
});
