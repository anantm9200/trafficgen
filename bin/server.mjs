import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';

const routes=new Map([
 ['GET /api/health','../api/health.js'],
 ['GET /api/spec','../api/spec.js'],
 ['GET /api/dns-status','../api/dns-status.js'],
 ['POST /api/validate','../api/validate.js'],
 ['POST /api/site-verify','../api/site-verify.js'],
 ['POST /api/dispatch','../api/dispatch.js'],
 ['GET /api/runs','../api/runs.js'],
 ['POST /api/ga4-test','../api/ga4-test.js']
]);
const port=Number(process.env.PORT||4174);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Access-Control-Allow-Origin','null');
 const pathname=new URL(req.url||'/', 'http://localhost').pathname;
 const route=routes.get(req.method+' '+(pathname==='/'?'/api/health':pathname));
 if(!route){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Not found'}));return;}
 let body=null;let bytes=0;
 if(req.method==='POST'){
  const chunks=[];
  for await (const chunk of req){
   bytes+=chunk.length;if(bytes>15000){res.writeHead(413);res.end('Request too large');return;}
   chunks.push(chunk);
  }
  try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{res.writeHead(400);res.end('Invalid JSON');return;}
 }
 req.body=body;
 req.query=Object.fromEntries(new URL(req.url,'http://127.0.0.1').searchParams);
 const adapter={
  setHeader:(k,v)=>res.setHeader(k,v),
  status(code){res.statusCode=code;return this;},
  json(object){if(!res.headersSent)res.setHeader('Content-Type','application/json');res.end(JSON.stringify(object));}
 };
 try{const {default:handler}=await import(route);await handler(req,adapter);}
 catch(e){if(!res.writableEnded){res.statusCode=500;res.end(JSON.stringify({ok:false,error:'Unhandled API error'}));}console.error('API error',e.message);}
});
server.listen(port,'127.0.0.1',()=>console.log('VisitorLab API listening on http://127.0.0.1:'+port));
