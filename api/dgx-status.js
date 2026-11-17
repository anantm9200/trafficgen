import {apiAuth,onlyMethod,reply,handle} from '../src/http.mjs';
import {checkDgxHealth} from '../src/dgx-client.mjs';

export default async function handler(req,res){
 await handle(res,async()=>{
  onlyMethod(req,'GET');
  apiAuth(req);
  const status=await checkDgxHealth();
  reply(res,200,{ok:true,connected:true,worker:status});
 });
}
