import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const [action,arg]=process.argv.slice(2);
const usage='Usage: node bin/trafficgen.mjs template FILE | validate FILE | dispatch FILE | ga4-debug FILE | runs';
if(!['template','validate','dispatch','ga4-debug','runs'].includes(action)){console.error(usage);process.exit(1);}
async function main(){
 if(action==='template'){
  if(!arg)throw Error('Supply a file path');
  const token='tg_'+randomBytes(24).toString('base64url');
  const plan={name:'Authorized browser QA',targetUrl:'https://www.your-domain.com/',authorized:false,
   verificationToken:token,countries:['AE','IN','US'],devices:['desktop','iphone','android'],
   browser:'chromium',sessions:6,concurrency:1,intervalSeconds:8,dwellSeconds:15,maxPages:2,
   interactions:{scroll:true,hover:true,navigate:true,checkImages:true},
   analytics:{enabled:false,measurementId:'',utm:{
    utm_source:'visitorlab',utm_medium:'synthetic_test',utm_campaign:'website_qa',
    utm_id:'qa_run_001',utm_term:'',utm_content:'desktop_mobile',
    utm_source_platform:'visitorlab',utm_creative_format:'',utm_marketing_tactic:'quality_assurance'}}
  };
  await writeFile(arg,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  console.log('Plan written:',arg);
  console.log('Publish your verification token as plain text at https://YOUR_DOMAIN/.well-known/visitorlab-verify.txt');
  console.log('Edit targetUrl and set authorized:true only for websites you own or are permitted to test.');
  return;
 }
 const base=process.env.TG_API_BASE||'http://127.0.0.1:4174';
 const key=process.env.TG_API_KEY;
 if(!key)throw Error('Set TG_API_KEY in the terminal environment; never store it in the plan JSON.');
 const paths={validate:'/api/validate',dispatch:'/api/dispatch','ga4-debug':'/api/ga4-test',runs:'/api/runs'};
 const body=action==='runs'?undefined:JSON.parse(await readFile(arg,'utf8'));
 const response=await fetch(new URL(paths[action],base),{
  method:body?'POST':'GET',
  headers:{'authorization':'Bearer '+key,'content-type':'application/json'},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)
 });
 const result=await response.json();
 console.log(JSON.stringify(result,null,2));
 if(!response.ok)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
