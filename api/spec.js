import {COUNTRIES,DEVICES,UTM_KEYS} from '../src/plan.mjs';
import {reply} from '../src/http.mjs';
export default function handler(req,res){
 if(req.method!=='GET')return reply(res,405,{ok:false,error:'Method not allowed'});
 reply(res,200,{ok:true,schemaVersion:1,required:['targetUrl','authorized:true','verificationToken'],
  limits:{maxSessions:25,maxConcurrency:3,minIntervalSeconds:6,maxPages:4},
  countries:COUNTRIES,devices:DEVICES,browsers:['chromium','firefox','webkit'],
  ga4:{measurementIdFormat:'G-XXXXXXXX',utmKeys:UTM_KEYS,analyticsSecret:'GA4_API_SECRET in server/worker environment',eventName:'visitorlab_synthetic_visit',
  warning:'Synthetic event metadata, not real acquisition/source-IP attribution'},
  verifyFile:'https://YOUR_DOMAIN/.well-known/visitorlab-verify.txt',inspection:{endpoint:'POST /api/inspect',requiresAuthentication:true,requiresOwnershipProof:true,mode:'one tagged HTTPS GET of verified site, no browser or simulated country-origin IP'},example:{
   targetUrl:'https://YOUR_DOMAIN/',authorized:true,verificationToken:'tg_replace-with-a-random-unique-string',
   sessions:6,concurrency:1,intervalSeconds:8,dwellSeconds:15,maxPages:2,countries:['AE','IN','US'],
   devices:['desktop','iphone','android'],browser:'chromium',
   analytics:{enabled:false,measurementId:'G-EXAMPLE123',utm:{utm_source:'visitorlab',utm_medium:'synthetic_test',utm_campaign:'prelaunch_qa',utm_content:'mobile_test'}}}
 });
}
