import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';

async function freePort(){return new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))})})}
const delay=ms=>new Promise(r=>setTimeout(r,ms));

test('DGX queue upgrades legacy database and marks interrupted job failed without re-dispatch',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tg-restart-v5-'));
 let child;
 try{
  const dbPath=join(dir,'legacy.sqlite'),db=new DatabaseSync(dbPath);
  db.exec("CREATE TABLE jobs (id TEXT PRIMARY KEY,status TEXT NOT NULL,plan TEXT NOT NULL,report TEXT,error TEXT,created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT)");
  const runningId=randomUUID(),completedId=randomUUID(),cancelledId=randomUUID();
  const insert=db.prepare('INSERT INTO jobs(id,status,plan,report,error,created_at,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run(runningId,'running',JSON.stringify({runId:randomUUID()}),null,null,'2026-11-18T08:00:00.000Z','2026-11-18T08:00:02.000Z',null);
  insert.run(completedId,'completed',JSON.stringify({runId:randomUUID()}),JSON.stringify({plan:{synthetic:true}}),null,'2026-11-18T07:00:00.000Z','2026-11-18T07:00:01.000Z','2026-11-18T07:00:10.000Z');
  insert.run(cancelledId,'cancelled',JSON.stringify({runId:randomUUID()}),null,null,'2026-11-18T07:00:00.000Z',null,'2026-11-18T07:00:01.000Z');
  db.close();
  const port=await freePort(),token='z'.repeat(44),root=new URL('../',import.meta.url).pathname;
  child=spawn(process.execPath,['worker/dgx-queue.mjs'],{cwd:root,env:{...process.env,TG_WORKER_PORT:String(port),TG_QUEUE_DB:dbPath,TG_DGX_JOB_TOKEN:token},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',c=>{stderr+=c.toString()});
  const url='http://127.0.0.1:'+port;
  let live=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch(url+'/health',{signal:AbortSignal.timeout(400)});if(r.ok){live=true;break}}catch{}
   await delay(35);
  }
  assert.equal(live,true,'Queue failed to boot: '+stderr);
  assert.equal((await stat(dbPath)).mode&0o777,0o600);
  const health=await (await fetch(url+'/health')).json();
  assert.equal(health.metrics.counts.running,0);
  assert.equal(health.metrics.counts.failed,1);
  assert.equal(health.metrics.counts.completed,1);
  assert.equal(health.metrics.counts.cancelled,1);
  assert.equal(health.activeJob,null);
  const r=await fetch(url+'/jobs',{headers:{Authorization:'Bearer '+token}});
  assert.equal(r.status,200);
  const jobs=(await r.json()).jobs;
  assert.equal(jobs.find(j=>j.id===runningId).status,'failed');
  assert.match(jobs.find(j=>j.id===runningId).error,/restarted during execution/i);
  assert.equal(jobs.find(j=>j.id===completedId).status,'completed');
  assert.equal(jobs.find(j=>j.id===cancelledId).status,'cancelled');
  child.kill('SIGTERM');
  const code=await Promise.race([new Promise(res=>child.once('exit',res)),delay(3000).then(()=>null)]);
  assert.equal(code,0,'Graceful queue shutdown failed');
  child=null;
  const reopened=new DatabaseSync(dbPath);
  const columns=reopened.prepare('PRAGMA table_info(jobs)').all().map(x=>x.name);
  assert.ok(columns.includes('run_id'));
  assert.equal(reopened.prepare('SELECT status FROM jobs WHERE id=?').get(runningId).status,'failed');
  reopened.close();
 }finally{
  if(child){child.kill('SIGKILL');await delay(100)}
  await rm(dir,{recursive:true,force:true});
 }
});
