import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadValidatedJobReport} from '../src/job-report-validation.mjs';

test('valid bounded synthetic report is accepted only for the correct fresh run',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tg-validation-v5-'));
 try{
  const runId=randomUUID(),startedAt=new Date(Date.now()-2000).toISOString();
  const file=join(dir,'report-'+runId+'.json');
  const valid={plan:{runId,synthetic:true},summary:{completed:1},sessions:[{index:1,ok:true}]};
  await writeFile(file,JSON.stringify(valid));
  assert.deepEqual(await loadValidatedJobReport(dir,{runId,startedAt}),valid);
  assert.equal(await loadValidatedJobReport(dir,{runId:randomUUID(),startedAt}),null);
  assert.equal(await loadValidatedJobReport(dir,{runId:'../../etc/passwd',startedAt}),null);
  const old=new Date(Date.now()-60000);await utimes(file,old,old);
  assert.equal(await loadValidatedJobReport(dir,{runId,startedAt}),null);
  await writeFile(file,'not-json');
  assert.equal(await loadValidatedJobReport(dir,{runId,startedAt}),null);
  await writeFile(file,JSON.stringify({...valid,plan:{runId,synthetic:false}}));
  assert.equal(await loadValidatedJobReport(dir,{runId,startedAt}),null);
  await writeFile(file,JSON.stringify({...valid,plan:{runId:randomUUID(),synthetic:true}}));
  assert.equal(await loadValidatedJobReport(dir,{runId,startedAt}),null);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('rejects oversized report before parsing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tg-report-size-'));
 try{
  const runId=randomUUID(),startedAt=new Date(Date.now()-2000).toISOString();
  await writeFile(join(dir,'report-'+runId+'.json'),'x'.repeat(2*1024*1024+1));
  assert.equal(await loadValidatedJobReport(dir,{runId,startedAt}),null);
 }finally{await rm(dir,{recursive:true,force:true})}
});
