// Read-only classification; never store cookies, IPs or full request URLs.
const GA4=/^(?:www\.)?google-analytics\.com$|^(?:region\d+\.)google-analytics\.com$|^analytics\.google\.com$/i;
const VERCEL=/^(?:vitals\.)?vercel-insights\.com$/i;
export function classifyAnalyticsRequest(raw){
 let url;try{url=new URL(raw)}catch{return null}
 const host=url.hostname.toLowerCase();let provider=null;
 if(GA4.test(host)&&/^\/(?:g\/collect|collect|j\/collect)(?:$|\/)/.test(url.pathname))provider='ga4';
 if(VERCEL.test(host)&&/^\/v1\/(?:view|event|speed-insights)(?:$|\/)/.test(url.pathname))provider='vercel';
 if(!provider)return null;
 return {provider,kind:provider==='ga4'?'collection_request':url.pathname.split('/').at(-1),event:provider==='ga4'?(url.searchParams.get('en')||'unspecified').slice(0,80):'unspecified'};
}
export function summarizeAnalyticsRequests(events){
 const result={observed:events.length,ga4:0,vercel:0,byEvent:{},note:'Observed browser requests only; ingestion and reporting are not confirmed.'};
 for(const e of events){result[e.provider]++;const k=e.provider+':'+e.event;result.byEvent[k]=(result.byEvent[k]||0)+1;}return result;
}
