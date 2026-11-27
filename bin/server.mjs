import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {apiRoutes} from '../src/api-routes.mjs';

const routes=new Map(apiRoutes.map(route=>[route,'..'+route.split(' ')[1]+'.js']));
const assets=new Map([
 ['/command-center/',['command-center/index.html','text/html']],
 ['/command-center/app.js',['command-center/app.js','text/javascript']],
 ['/command-center/styles.css',['command-center/styles.css','text/css']],
 ['/dashboard',['index.html','text/html']],
 ['/index.html',['index.html','text/html']],
 ['/styles.css',['styles.css','text/css']],
 ['/app.js',['app.js','text/javascript']],
 ['/favicon.svg',['favicon.svg','image/svg+xml']]
]);
const port=Number(process.env.PORT||4174);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Access-Control-Allow-Origin','null');
 const pathname=new URL(req.url||'/', 'http://localhost').pathname;
 if(req.method==='GET' && assets.has(pathname)){
  const [file,type]=assets.get(pathname);
  try{
   const data=await readFile(new URL('../'+file,import.meta.url));
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});
   res.end(data);
  }catch{res.writeHead(500);res.end('Dashboard asset unavailable');}
  return;
 }
 const route=routes.get(req.method+' '+(pathname==='/'?'/api/health':pathname));
 if(!route){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Not found'}));return;}
 let body;let bytes=0;
 if(req.method==='POST'||req.method==='PATCH'){
  const chunks=[];
  for await (const chunk of req){
   bytes+=chunk.length;if(bytes>15000){res.writeHead(413);res.end('Request too large');return;}
   chunks.push(chunk);
  }
  try{body=bytes?JSON.parse(Buffer.concat(chunks).toString('utf8')):null;}catch{res.writeHead(400);res.end('Invalid JSON');return;}
 }
 req.body=body;
 req.query=Object.fromEntries(new URL(req.url,'http://127.0.0.1').searchParams);
 const adapter={
  setHeader:(k,v)=>res.setHeader(k,v),
  status(code){res.statusCode=code;return this;},
  send(data){res.end(data);},
  json(object){if(!res.headersSent)res.setHeader('Content-Type','application/json');res.end(JSON.stringify(object));}
 };
 try{const {default:handler}=await import(route);await handler(req,adapter);}
 catch(e){if(!res.writableEnded){res.statusCode=500;res.end(JSON.stringify({ok:false,error:'Unhandled API error'}));}console.error('API error',e.message);}
});
server.listen(port,'127.0.0.1',()=>console.log('VisitorLab API listening on http://127.0.0.1:'+port));
