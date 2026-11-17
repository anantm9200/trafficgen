import http from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {normalizePlan,publicPlan} from '../src/plan.mjs';
import {verifyOwnership} from '../src/ownership.mjs';
const port=Number(process.env.TG_WORKER_PORT||18743);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid worker port');
const dbPath=resolve(process.env.TG_QUEUE_DB||'./.data/trafficgen.sqlite');
mkdirSync(resolve(dbPath,'..'),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,status TEXT NOT NULL,plan TEXT NOT NULL,report TEXT,error TEXT,created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT); CREATE INDEX IF NOT EXISTS jobs_recent ON jobs(created_at DESC)");
db.prepare("UPDATE jobs SET status='failed',error='Worker restarted during execution',finished_at=? WHERE status='running'").run(new Date().toISOString());
const started=Date.now();
let active=null;let pumping=false;
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
const authorized=req=>{
 const key=process.env.TG_DGX_JOB_TOKEN||'';
 const h=req.headers.authorization||'';
 const supplied=h.startsWith('Bearer ')?h.slice(7):'';
 const a=Buffer.from(key),b=Buffer.from(supplied);
 return a.length>=32&&a.length===b.length&&timingSafeEqual(a,b);
};
const publicJob=row=>row&&({id:row.id,status:row.status,createdAt:row.created_at,startedAt:row.started_at,finishedAt:row.finished_at,error:row.error,report:row.report?JSON.parse(row.report):null});
function schedule(){if(pumping)return;pumping=true;setImmediate(async()=>{try{await pump();}finally{pumping=false;if(!active&&db.prepare("SELECT id FROM jobs WHERE status='queued' LIMIT 1").get())schedule();}});}
async function pump(){
 if(active)return;
 const row=db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1").get();
 if(!row)return;
 const now=new Date().toISOString();
 db.prepare("UPDATE jobs SET status='running',started_at=? WHERE id=? AND status='queued'").run(now,row.id);
 const plan=JSON.parse(row.plan);
 const child=spawn(process.execPath,['worker/run.mjs','--env-plan'],{
  cwd:resolve('.'),env:{...process.env,PLAN_B64:Buffer.from(JSON.stringify(plan)).toString('base64url')},
  stdio:['ignore','pipe','pipe']});
 active={id:row.id,child,cancelled:false};
 let output='',errors='';
 child.stdout.on('data',c=>{output=(output+c.toString()).slice(-16000);});
 child.stderr.on('data',c=>{errors=(errors+c.toString()).slice(-4000);});
 const exit=await new Promise(resolveExit=>{child.once('error',e=>{errors=String(e.message);resolveExit(-1)});child.once('close',resolveExit)});
 const wasCancelled=active?.cancelled;
 active=null;
 const existing=db.prepare('SELECT status FROM jobs WHERE id=?').get(row.id);
 if(existing?.status==='cancelled'||wasCancelled){schedule();return;}
 let report=null;
 try{
  const {readFile}=await import('node:fs/promises');
  const file=resolve('reports/report-'+plan.runId+'.json');
  report=JSON.parse(await readFile(file,'utf8'));
 }catch{}
 const status=exit===0&&report?'completed':'failed';
 db.prepare('UPDATE jobs SET status=?,report=?,error=?,finished_at=? WHERE id=?').run(status,report?JSON.stringify(report):null,status==='failed'?(errors||'Worker exited without a complete report').slice(0,500):null,new Date().toISOString(),row.id);
 schedule();
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'trafficgen-dgx-worker',mode:'job-queue',uptimeSeconds:Math.floor((Date.now()-started)/1000),activeJob:active?.id||null});
  if(!authorized(req))return send(res,401,{ok:false,error:'Unauthorized'});
  if(req.method==='GET'&&url.pathname==='/jobs'){
   return send(res,200,{ok:true,jobs:db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 30").all().map(publicJob)});
  }
  const match=url.pathname.match(/^\/jobs\/([a-f0-9-]{36})(\/cancel)?$/);
  if(req.method==='GET'&&match&&!match[2]){
   const row=db.prepare('SELECT * FROM jobs WHERE id=?').get(match[1]);
   return row?send(res,200,{ok:true,job:publicJob(row)}):send(res,404,{ok:false,error:'Job not found'});
  }
  if(req.method==='POST'&&match&&match[2]){
   const row=db.prepare('SELECT status FROM jobs WHERE id=?').get(match[1]);
   if(!row)return send(res,404,{ok:false,error:'Job not found'});
   if(['queued','running'].includes(row.status)){
    db.prepare("UPDATE jobs SET status='cancelled',finished_at=? WHERE id=?").run(new Date().toISOString(),match[1]);
    if(active?.id===match[1]){active.cancelled=true;active.child.kill('SIGTERM');}
   }
   return send(res,200,{ok:true,job:publicJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(match[1]))});
  }
  if(req.method==='POST'&&url.pathname==='/jobs'){
   let size=0,parts=[];
   for await(const chunk of req){size+=chunk.length;if(size>16000)return send(res,413,{ok:false,error:'Plan too large'});parts.push(chunk);}
   let plan;try{plan=normalizePlan(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(e){return send(res,400,{ok:false,error:e.message});}
   // Verify ownership again on the DGX; never rely solely on the Vercel caller.
   await verifyOwnership(plan.targetUrl,plan.verificationToken,{method:plan.verificationMethod});
   if(plan.concurrency!==1)return send(res,400,{ok:false,error:'DGX currently permits concurrency=1'});
   if(plan.analytics.enabled)return send(res,400,{ok:false,error:'GA4 ingestion disabled for DGX queue; use synthetic observation only'});
   const pending=db.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('queued','running')").get().n;
   if(pending>=10)return send(res,429,{ok:false,error:'Queue capacity reached'});
   const id=randomUUID();
   db.prepare('INSERT INTO jobs(id,status,plan,created_at) VALUES(?,?,?,?)').run(id,'queued',JSON.stringify(plan),new Date().toISOString());
   schedule();return send(res,202,{ok:true,job:{id,status:'queued',plan:publicPlan(plan)}});
  }
  send(res,404,{ok:false,error:'Not found'});
 }catch(e){send(res,500,{ok:false,error:'Worker request failed'});console.error('Worker:',e.message);}
});
server.listen(port,'127.0.0.1',()=>{console.log('TrafficGen DGX queue at 127.0.0.1:'+port);schedule()});
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{if(active)active.child.kill('SIGTERM');server.close(()=>{db.close();process.exit(0)})});
