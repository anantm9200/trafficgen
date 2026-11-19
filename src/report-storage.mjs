import {mkdir,writeFile,link,unlink,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const MAX_BYTES=2*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const filePattern=/^report-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.json$/i;
export function reportRunId(report){
 const id=report?.plan?.runId;
 if(typeof id!=='string'||!uuid.test(id))throw new Error('Valid UUID run identifier required');
 return id.toLowerCase();
}
export function scrubReport(report){
 return JSON.parse(JSON.stringify(report,(key,value)=>{
  if(/^(?:apiSecret|verificationToken|password|authorization|accessToken|cookie)$/i.test(key))return '[redacted]';
  if(/^(?:url|href|targetUrl)$/i.test(key)&&typeof value==='string'){
   try{const u=new URL(value);if(u.protocol==='https:'||u.protocol==='http:')return u.origin+u.pathname}catch{}
  }
  return value;
 }));
}
export async function writePrivateReport(directory,report){
 const id=reportRunId(report),folder=resolve(directory),dest=join(folder,'report-'+id+'.json');
 const content=JSON.stringify(scrubReport(report),null,2)+'\n';
 if(Buffer.byteLength(content)>MAX_BYTES)throw new Error('Report exceeds bounded storage size');
 await mkdir(folder,{recursive:true,mode:0o700});
 const temp=join(folder,'.tmp-'+randomUUID()+'.json');
 try{
  await writeFile(temp,content,{flag:'wx',mode:0o600});
  await link(temp,dest); // Atomic, never overwrite an existing run.
 }finally{await unlink(temp).catch(()=>{})}
 return dest;
}
export async function pruneOldReports(directory,{maxAgeDays=30,now=Date.now()}={}){
 if(!Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>365)throw new Error('Invalid retention window');
 const folder=resolve(directory);let names;
 try{names=await readdir(folder)}catch(error){if(error.code==='ENOENT')return 0;throw error}
 let removed=0;
 for(const name of names){
  if(!filePattern.test(name))continue;
  const file=join(folder,name),info=await stat(file).catch(()=>null);
  if(info?.isFile()&&now-info.mtimeMs>maxAgeDays*86400000){await unlink(file);removed++}
 }
 return removed;
}
