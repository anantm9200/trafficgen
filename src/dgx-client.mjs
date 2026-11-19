const EXPECTED_ORIGIN='https://trafficgen-dgx-spark.iagatlas.com';
export async function checkDgxHealth({env=process.env,fetchImpl=fetch}={}){
 const base=env.DGX_API_URL;
 if(!base)throw Object.assign(new Error('DGX endpoint not configured'),{status:503});
 let parsed;try{parsed=new URL(base)}catch{throw Object.assign(new Error('Invalid DGX endpoint'),{status:503})}
 if(parsed.origin!==EXPECTED_ORIGIN||parsed.href!==EXPECTED_ORIGIN+'/')throw Object.assign(new Error('DGX endpoint is not the approved hostname'),{status:503});
 const id=env.CF_ACCESS_CLIENT_ID,secret=env.CF_ACCESS_CLIENT_SECRET;
 if(!id||!secret)throw Object.assign(new Error('DGX service authentication not configured'),{status:503});
 let response;try{response=await fetchImpl(EXPECTED_ORIGIN+'/health',{method:'GET',redirect:'manual',headers:{'CF-Access-Client-Id':id,'CF-Access-Client-Secret':secret,Accept:'application/json'},signal:AbortSignal.timeout(7000)})}
 catch{throw Object.assign(new Error('DGX health connection failed'),{status:502})}
 if(!response.ok)throw Object.assign(new Error('DGX health check rejected (HTTP '+response.status+')'),{status:502});
 if(!(response.headers.get('content-type')||'').includes('application/json'))throw Object.assign(new Error('DGX returned unexpected content'),{status:502});
 let payload;try{payload=await response.json()}catch{throw Object.assign(new Error('DGX returned invalid JSON'),{status:502})}
 if(payload?.ok!==true||payload.service!=='trafficgen-dgx-worker')throw Object.assign(new Error('Unexpected DGX service identity'),{status:502});
 return {service:payload.service,mode:payload.mode,uptimeSeconds:payload.uptimeSeconds,activeJob:payload.activeJob||null,metrics:payload.metrics??null};
}
export async function dgxRequest(path,{method='GET',body,env=process.env,fetchImpl=fetch}={}){
 const base=env.DGX_API_URL;
 if(base!==EXPECTED_ORIGIN)throw Object.assign(new Error('DGX endpoint not configured'),{status:503});
 if(!env.CF_ACCESS_CLIENT_ID||!env.CF_ACCESS_CLIENT_SECRET||!env.TG_DGX_JOB_TOKEN)
  throw Object.assign(new Error('DGX job authentication not configured'),{status:503});
 if(!/^\/jobs(?:\/[a-f0-9-]{36}(?:\/cancel)?)?$/.test(path))throw Object.assign(new Error('Invalid DGX route'),{status:400});
 let r;try{r=await fetchImpl(base+path,{method,redirect:'manual',headers:{'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET,
  Authorization:'Bearer '+env.TG_DGX_JOB_TOKEN,'Content-Type':'application/json',Accept:'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(method==='POST'?15000:9000)})}
 catch{throw Object.assign(new Error('DGX job API unreachable'),{status:502})}
 let data=null;if((r.headers.get('content-type')||'').includes('application/json'))try{data=await r.json()}catch{}
 if(!r.ok)throw Object.assign(new Error(data?.error||'DGX job API HTTP '+r.status),{status:[400,401,404,413,429].includes(r.status)?r.status:502});
 if(!data?.ok)throw Object.assign(new Error('Invalid DGX job response'),{status:502});
 return data;
}
