// Strict allowlist shared by Vercel and the DGX loopback bridge.
// No arbitrary HTTP proxying, hostnames, encoded slashes or query strings.
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const RE=new RegExp('^'+UUID+'$');
const simple={
 'campaigns':['GET','POST'],
 'runs':['GET'],
 'runs.csv':['GET'],
 'insights':['GET'],
 'worker-health':['GET'],
 'qa/health':['GET'],
 'scheduler/tick':['POST']
};
export function allowCampaignRoute(route,method){
 if(typeof route!=='string'||route.length>150||typeof method!=='string'||
    !/^[a-z0-9./-]+$/.test(route)||route.includes('..')||route.includes('//')||route.startsWith('/')||route.endsWith('/'))return false;
 if(simple[route])return simple[route].includes(method);
 const parts=route.split('/');
 if(parts[0]==='campaigns'&&parts.length===2&&RE.test(parts[1]))return method==='GET';
 if(parts[0]==='campaigns'&&parts.length===3&&RE.test(parts[1]))
  return (parts[2]==='run'&&method==='POST')||(parts[2]==='status'&&method==='PATCH');
 if(parts[0]==='runs'&&parts.length===2&&RE.test(parts[1]))return method==='GET';
 if(parts[0]==='runs'&&parts.length===3&&RE.test(parts[1]))return ['refresh','cancel'].includes(parts[2])&&method==='POST';
 if(parts[0]==='qa'&&parts[1]==='runs'&&parts.length===3&&RE.test(parts[2]))return method==='GET';
 if(parts[0]==='qa'&&parts[1]==='runs'&&parts.length===4&&RE.test(parts[2]))return ['send','verify'].includes(parts[3])&&method==='POST';
 return false;
}
export const campaignPath=route=>'/api/'+route;
