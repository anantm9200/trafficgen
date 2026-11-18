import http from 'node:http';
import os from 'node:os';

const port=Number(process.env.TG_WORKER_PORT||18743);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('TG_WORKER_PORT must be 1024–65535');
const started=Date.now();
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'||req.url!=='/health'){
  res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'not found'}));return;
 }
 res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({ok:true,service:'trafficgen-dgx-worker',mode:'health-only',uptimeSeconds:Math.floor((Date.now()-started)/1000),hostname:os.hostname(),node:process.version}));
});
server.on('error',e=>{console.error('Worker health server:',e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('TrafficGen DGX health listening at http://127.0.0.1:'+port+'/health'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
