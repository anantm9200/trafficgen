/** External network policy for authorized, read-only synthetic browser QA.
 * Analytics tag libraries may load for observation, but collection is blocked.
 * Decisions never change IP origin or claim analytics delivery.
 */
const STATIC_HOSTS=new Set([
 'fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net',
 'cdnjs.cloudflare.com','unpkg.com','images.unsplash.com'
]);
const TAG_SCRIPTS={
 'www.googletagmanager.com':/^\/(?:gtag\/js|gtm\.js)\/?$/,
 'va.vercel-scripts.com':/^\/v1\/(?:script\.js|speed-insights\/script\.js)$/
};
export function decideBrowserRequest({url,method='GET',resourceType='document',isNavigation=false,origin}){
 let dest,home;
 try{dest=new URL(url);home=new URL(origin);}catch{return {allow:false,reason:'invalid_url'};}
 if(['blob:','data:'].includes(dest.protocol))return {allow:true,owned:false,reason:'browser_resource'};
 if(dest.protocol!=='https:'||!['GET','HEAD'].includes(method))return {allow:false,reason:'unsafe_protocol_or_method'};
 if(home.protocol!=='https:')return {allow:false,reason:'invalid_origin'};
 if(/(^|\.)(google-analytics\.com|vercel-insights\.com)$/.test(dest.hostname) ||
    /^\/(?:_vercel\/(?:insights|speed-insights)|g\/collect|mp\/collect)(?:\/|$)/.test(dest.pathname))
  return {allow:false,reason:'analytics_collection'};
 if(dest.origin===home.origin)return {allow:true,owned:true,reason:'verified_origin'};
 if(isNavigation)return {allow:false,reason:'external_navigation'};
 if(method==='GET'&&resourceType==='script'&&TAG_SCRIPTS[dest.hostname]?.test(dest.pathname))
  return {allow:true,owned:false,reason:'analytics_tag_only'};
 if(STATIC_HOSTS.has(dest.hostname)&&['stylesheet','font','image','script'].includes(resourceType))
  return {allow:true,owned:false,reason:'approved_static_resource'};
 return {allow:false,reason:'third_party_blocked'};
}
