import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectGoogleTags} from '../src/ga4-detect.mjs';
import {submitGA4} from '../src/ga4.mjs';

test('detects GA4 measurement IDs from script src, preloads and HTML bootstrap data',()=>{
 const html='<link rel="preload" href="/gtag.js?id=G-PRELOAD1234">'+
 '<div data-ga4-id="G-DATA12345"></div>'+
 '<script type="application/json">{"ga4":"G-JSON12345"}</script>'+
 '<script>window.__config={measurement:"G\\u002dESCAPE1234"}</script>';
 const result=detectGoogleTags(html);
 assert.deepEqual(result.measurementIds.sort(),['G-DATA12345','G-ESCAPE1234','G-JSON12345','G-PRELOAD1234'].sort());
 assert.equal(result.status,'measurement_id_detected');
 assert.equal(result.trackingActiveConfirmed,false);
});
test('GTM container is not misrepresented as GA4 Measurement ID',()=>{
 const result=detectGoogleTags('<script src="/assets/gtm.js?container=GTM-ABCD1234"></script>');
 assert.deepEqual(result.measurementIds,[]);
 assert.deepEqual(result.tagManagerIds,['GTM-ABCD1234']);
 assert.equal(result.status,'gtm_container_only');
});
test('website verification code preserves verified status and GA4 on recheck failure',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/const previouslyVerified=site.status==='verified'/);
 assert.match(source,/if\(!previouslyVerified\)\{site.status='pending';site.verifiedAt=null;\}/);
 assert.match(source,/hasPreviousIds&&!hasNewIds/);
 assert.match(source,/site\.ga4LastError=/);
});

test('normal GA4 collection fails closed even with matching credentials',async()=>{
 const plan={analytics:{enabled:true,measurementId:'G-TEST12345'}};
 const result=await submitGA4(plan,{},{measurementId:'G-TEST12345',apiSecret:'test-only',fetchImpl:async()=>{throw Error('network must not be called')}});
 assert.deepEqual(result,{sent:false,reason:'qa_property_isolation_required'});
});
test('GA4 debug validation still uses only the validation endpoint',async()=>{
 const plan={runId:'test-run',browser:'chromium',analytics:{enabled:true,measurementId:'G-TEST12345'}};
 const result=await submitGA4(plan,{},{debug:true,measurementId:'G-TEST12345',apiSecret:'test-only',fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).pathname,'/debug/mp/collect');
  assert.equal(JSON.parse(options.body).events[0].params.tg_synthetic,1);
  return {ok:true,status:200,json:async()=>({validationMessages:[]})};
 }});
 assert.equal(result.sent,true);
});
