import {apiAuth,handle,reply} from '../src/http.mjs';
import {dgxRequest} from '../src/dgx-client.mjs';
export default async function handler(req,res){await handle(res,async()=>{
 apiAuth(req);
 const id=String(req.query.id||'');
 if(!/^[a-f0-9-]{36}$/.test(id))throw Object.assign(new Error('Invalid job ID'),{status:400});
 const path='/jobs/'+id;
 if(req.method==='GET')return reply(res,200,await dgxRequest(path));
 if(req.method==='POST')return reply(res,200,await dgxRequest(path+'/cancel',{method:'POST'}));
 reply(res,405,{ok:false,error:'Method not allowed'});
});}
