const EXPECTED_ORIGIN='https://trafficgen-dgx-spark.iagatlas.com';
export async function checkDgxHealth({env=process.env,fetchImpl=fetch}={}){
 const base=env.DGX_API_URL;
 if(!base)throw Object.assign(new Error('DGX endpoint not configured'),{status:503});
 let parsed;
 try{parsed=new URL(base);}catch{throw Object.assign(new Error('Invalid DGX endpoint'),{status:503});}
 if(parsed.origin!==EXPECTED_ORIGIN||parsed.href!==EXPECTED_ORIGIN+'/')
  throw Object.assign(new Error('DGX endpoint is not the approved hostname'),{status:503});
 const id=env.CF_ACCESS_CLIENT_ID,secret=env.CF_ACCESS_CLIENT_SECRET;
 if(!id||!secret)throw Object.assign(new Error('DGX service authentication not configured'),{status:503});
 let response;
 try{
  response=await fetchImpl(EXPECTED_ORIGIN+'/health',{
   method:'GET',redirect:'manual',headers:{
    'CF-Access-Client-Id':id,
    'CF-Access-Client-Secret':secret,
    'Accept':'application/json'
   },signal:AbortSignal.timeout(7000)
  });
 }catch{throw Object.assign(new Error('DGX health connection failed'),{status:502});}
 if(!response.ok)throw Object.assign(new Error('DGX health check rejected (HTTP '+response.status+')'),{status:502});
 const type=response.headers.get('content-type')||'';
 if(!type.includes('application/json'))throw Object.assign(new Error('DGX returned unexpected content'),{status:502});
 let payload;
 try{payload=await response.json();}catch{throw Object.assign(new Error('DGX returned invalid JSON'),{status:502});}
 if(payload?.ok!==true||payload?.service!=='trafficgen-dgx-worker')
  throw Object.assign(new Error('Unexpected DGX service identity'),{status:502});
 return {service:payload.service,mode:payload.mode,uptimeSeconds:payload.uptimeSeconds};
}
