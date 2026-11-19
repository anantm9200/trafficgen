/** Strict network policy for authorized synthetic browser QA. */
const STATIC_HOSTS=new Set(['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net','cdnjs.cloudflare.com','unpkg.com','images.unsplash.com']);
export function decideBrowserRequest({url,method='GET',resourceType='document',isNavigation=false,origin}){
 let dest,home;try{dest=new URL(url);home=new URL(origin);}catch{return {allow:false,reason:'invalid_url'};}
 if(['blob:','data:'].includes(dest.protocol))return {allow:true,owned:false};
 if(dest.protocol!=='https:'||!['GET','HEAD'].includes(method)||home.protocol!=='https:')return {allow:false,reason:'unsafe_protocol_or_method'};
 if(isNavigation&&dest.origin!==home.origin)return {allow:false,reason:'cross_origin_navigation'};
 if(dest.origin===home.origin)return {allow:true,owned:true};
 if(method==='GET'&&resourceType==='script'&&(
   (dest.hostname==='www.googletagmanager.com'&&['/gtag/js','/gtm.js'].includes(dest.pathname))||
   (dest.hostname==='va.vercel-scripts.com'&&['/v1/script.js','/v1/speed-insights/script.js'].includes(dest.pathname))
 ))return {allow:true,owned:false,reason:'tag_script_only'};
 if(STATIC_HOSTS.has(dest.hostname)&&['stylesheet','font','image','script'].includes(resourceType))return {allow:true,owned:false,reason:'static_asset'};
 return {allow:false,reason:'third_party_blocked'};
}
