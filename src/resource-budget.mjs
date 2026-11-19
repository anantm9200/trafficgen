import os from 'node:os';
const GiB=1024**3;
/**
 * Advisory resource budget for DGX and CI. Never auto-increase worker concurrency.
 * The DGX queue has an independent concurrency=1 hard cap.
 */
export function resourceAdmission({freeMemoryBytes,totalMemoryBytes,load1,cpuCount,
 requestedConcurrency=1,maxConcurrency=1,minFreeBytes=2*GiB}={}){
 const nums=[freeMemoryBytes,totalMemoryBytes,load1,cpuCount,requestedConcurrency,maxConcurrency,minFreeBytes];
 if(nums.some(x=>!Number.isFinite(x)||x<0)||totalMemoryBytes<=0||cpuCount<1||
  !Number.isInteger(requestedConcurrency)||requestedConcurrency<1||
  !Number.isInteger(maxConcurrency)||maxConcurrency<1||!Number.isInteger(cpuCount))throw new Error('Invalid resource sample');
 const normalizedLoad=load1/cpuCount;
 const lowMemory=freeMemoryBytes<minFreeBytes;
 const highLoad=normalizedLoad>=.9;
 const permittedConcurrency=Math.min(requestedConcurrency,maxConcurrency,highLoad?1:maxConcurrency);
 const allowed=!lowMemory;
 return {allowed,reason:lowMemory?'low_available_memory':highLoad?'high_cpu_load':'normal',
  concurrency:allowed?permittedConcurrency:0,
  loadPerCore:Number(normalizedLoad.toFixed(3)),
  freeMemoryMiB:Math.round(freeMemoryBytes/1048576),
  reservedHeadroomMiB:Math.round(minFreeBytes/1048576)};
}
export function sampleResourceAdmission(options={}){
 return resourceAdmission({freeMemoryBytes:os.freemem(),totalMemoryBytes:os.totalmem(),
  load1:os.loadavg()[0],cpuCount:os.availableParallelism?.()||os.cpus().length,...options});
}
