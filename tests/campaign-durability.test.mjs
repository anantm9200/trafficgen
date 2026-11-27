import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {CampaignStore} from '../src/campaign-store.mjs';
const draft={siteUrl:'https://example.org',journey:[{action:'navigate',path:'/'}],sessions:1,intervalSeconds:8};
test('SQLite campaigns and run records persist across process restart',()=>{
 const root=mkdtempSync(join(tmpdir(),'tg-durability-')),file=join(root,'campaigns.sqlite');
 try{
  const first=new CampaignStore({path:file});
  const c=first.create(draft);first.status(c.id,'active');
  const r=first.reserveRun(c.id,{idempotencyKey:'restart_safe_01'}).run;
  first.close();
  const second=new CampaignStore({path:file});
  assert.equal(second.get(c.id).status,'active');
  assert.equal(second.getRun(r.id).status,'queued');
  const duplicate=second.reserveRun(c.id,{idempotencyKey:'restart_safe_01'});
  assert.equal(duplicate.replayed,true);assert.equal(duplicate.run.id,r.id);
  second.close();
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('duplicate reservations cannot bypass daily budget or create extra jobs',()=>{
 const s=new CampaignStore();try{
  const c=s.create({...draft,sessions:25});s.status(c.id,'active');
  const a=s.reserveRun(c.id,{idempotencyKey:'idempotent_001'});
  const b=s.reserveRun(c.id,{idempotencyKey:'idempotent_001'});
  assert.equal(a.run.id,b.run.id);
  assert.throws(()=>s.reserveRun(c.id,{idempotencyKey:'idempotent_002'}),/budget/);
  assert.equal(s.runs(c.id).length,1);
 }finally{s.close()}
});
