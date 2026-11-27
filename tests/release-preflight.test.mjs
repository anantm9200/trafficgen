import test from 'node:test';
import assert from 'node:assert/strict';
import {releasePreflight} from '../scripts/preflight.mjs';
test('preflight never prints credentials and does not equate source readiness with live readiness',()=>{
 const r=releasePreflight();assert.equal(r.localSourceReady,true);assert.equal(typeof r.liveReady,'boolean');
 assert.ok(!JSON.stringify(r).includes('password'));
});
test('ready flags require a dedicated QA property and distinct measurement ID',()=>{
 const env={TG_DGX_JOB_TOKEN:'a'.repeat(32),TG_CAMPAIGN_SERVICE_TOKEN:'b'.repeat(32),TG_API_KEY:'c'.repeat(24),
  DGX_API_URL:'https://trafficgen-dgx-spark.iagatlas.com',CF_ACCESS_CLIENT_ID:'client',CF_ACCESS_CLIENT_SECRET:'secret',
  GA4_QA_MEASUREMENT_ID:'G-SAME',GA4_PRODUCTION_MEASUREMENT_ID:'G-SAME',GA4_QA_API_SECRET:'secret',
  GA4_QA_PROPERTY_ID:'123456789',GA4_QA_SA_EMAIL:'qa@account.iam.gserviceaccount.com',GA4_QA_SA_PRIVATE_KEY:'private'};
 assert.equal(releasePreflight({env}).liveReady,false);
 env.GA4_QA_MEASUREMENT_ID='G-OTHER';assert.equal(releasePreflight({env}).liveReady,true);
});
