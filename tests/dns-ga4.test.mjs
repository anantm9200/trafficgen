import test from 'node:test';
import assert from 'node:assert/strict';
import {dnsProofRecord,flattenTxtRecords,verifyDnsOwnership} from '../src/dns-proof.mjs';
import {detectGoogleTags} from '../src/ga4-detect.mjs';
import {normalizePlan} from '../src/plan.mjs';
import {inspectHtml} from '../src/inspection.mjs';

const token='tg_1234567890abcdefgh',origin='https://www.example.org/';
test('DNS TXT hostname and record value are exact for the website host',()=>{
 const r=dnsProofRecord(origin,token);
 assert.deepEqual(r,{name:'_visitorlab.www.example.org',type:'TXT',value:'visitorlab-verification='+token,host:'www.example.org'});
 assert.deepEqual(flattenTxtRecords([['visitorlab-verification=tg_','1234567890abcdefgh'],['other=value']]),['visitorlab-verification='+token,'other=value']);
});
test('verifies the DNS TXT value only with public DNS resolution',async()=>{
 const result=await verifyDnsOwnership(origin,token,{dnsCheck:async()=>['8.8.8.8'],txtLookup:async name=>{
  assert.equal(name,'_visitorlab.www.example.org');return [['visitorlab-verification='+token]];
 }});
 assert.equal(result.verified,true);
 assert.equal(result.method,'dns_txt');
 assert.equal(result.hostname,'www.example.org');
});
test('rejects missing TXT, mismatched TXT, invalid tokens and invalid domains',async()=>{
 const opts={dnsCheck:async()=>['8.8.8.8'],txtLookup:async()=>[['not-your-token']]};
 await assert.rejects(()=>verifyDnsOwnership(origin,token,opts),/did not match/);
 await assert.rejects(()=>verifyDnsOwnership(origin,token,{...opts,txtLookup:async()=>{const e=new Error('no data');e.code='ENODATA';throw e;}}),/record not found/);
 await assert.rejects(()=>verifyDnsOwnership(origin,'tg_bad',opts),/Invalid/);
 await assert.rejects(()=>verifyDnsOwnership('http://localhost/',token,opts),/HTTPS/);
});
test('finds GA4 Measurement IDs from Google tag snippets without running JavaScript',()=>{
 const html='<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC12345"></script>'+
  "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-ABC12345')</script></head></html>";
 const out=detectGoogleTags(html);
 assert.equal(out.status,'measurement_id_detected');
 assert.deepEqual(out.measurementIds,['G-ABC12345']);
 assert.equal(out.trackingActiveConfirmed,false);
 assert.deepEqual(inspectHtml(html).ga4.measurementIds,['G-ABC12345']);
});
test('GTM without visible GA4 ID is never mislabeled as installed GA4',()=>{
 const html='<script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST123"></script>';
 const out=detectGoogleTags(html);
 assert.equal(out.status,'gtm_container_only');
 assert.deepEqual(out.measurementIds,[]);
 assert.deepEqual(out.tagManagerIds,['GTM-TEST123']);
});
test('dynamic, consent-gated tags are not claimed as detected',()=>{
 const out=detectGoogleTags('<main>GA4 tracking: G-EXAMPLE123 - embedded only in page text</main>');
 assert.equal(out.status,'not_found_in_html');
 assert.equal(out.trackingActiveConfirmed,false);
});
test('normalized plans specify DNS TXT as the default ownership method',()=>{
 const plan=normalizePlan({targetUrl:origin,verificationToken:token,authorized:true});
 assert.equal(plan.verificationMethod,'dns_txt');
 assert.equal(normalizePlan({...plan,verificationMethod:'http_file'}).verificationMethod,'http_file');
 assert.throws(()=>normalizePlan({...plan,verificationMethod:'nope'}),/Invalid website/);
});
