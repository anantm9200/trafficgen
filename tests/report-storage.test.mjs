import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm,utimes,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {reportRunId,scrubReport,writePrivateReport,pruneOldReports} from '../src/report-storage.mjs';
const id='12345678-1234-1234-1234-123456789012';
test('rejects traversal or malformed report ids',()=>{
 assert.throws(()=>reportRunId({plan:{runId:'../foo'}}));
});
test('redacts verification secrets and URL query parameters',()=>{
 const r=scrubReport({plan:{runId:id,verificationToken:'TGSECRET',targetUrl:'https://example.org/?secret=1'},
  sessions:[{pages:[{url:'https://example.org/a?key=abc'}]}]});
 assert.equal(r.plan.verificationToken,'[redacted]');
 assert.equal(r.plan.targetUrl,'https://example.org/');
 assert.equal(r.sessions[0].pages[0].url,'https://example.org/a');
});
test('persists private reports without overwriting an existing run',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trafficgen-private-'));
 try{
  const report={plan:{runId:id,verificationToken:'private'},summary:{requested:1}};
  const filepath=await writePrivateReport(dir,report);
  const saved=await readFile(filepath,'utf8');
  assert.ok(!saved.includes('private'));
  assert.ok((await stat(filepath)).mode&0o077 ? false : true);
  await assert.rejects(writePrivateReport(dir,report),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('pruning removes only old report-pattern files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'trafficgen-prune-'));
 try{
  const target=await writePrivateReport(dir,{plan:{runId:id}});
  const old=new Date(Date.now()-40*86400000);
  await utimes(target,old,old);
  await writeFile(join(dir,'important.json'),'keep');
  assert.equal(await pruneOldReports(dir,{maxAgeDays:30}),1);
  assert.equal((await readFile(join(dir,'important.json'),'utf8')),'keep');
 }finally{await rm(dir,{recursive:true,force:true})}
});
