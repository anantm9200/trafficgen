/**
 * Passive, static HTML tag discovery. No scripts are executed and no
 * measurement requests are made. GTM IDs are NOT GA4 measurement IDs.
 */
export function detectGoogleTags(html){
 const source=String(html||'').slice(0,524288);
 const scriptBodies=[...source.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(x=>x[0]);
 const scripts=[...source.matchAll(/<script\b[^>]*>/gi)].map(x=>x[0]);
 const scriptText=scriptBodies.join('\n');
 const ids=new Set(),containers=new Set();
 const gaId=/\bG-[A-Z0-9]{5,20}\b/gi,gtmId=/\bGTM-[A-Z0-9]{4,20}\b/gi;
 for(const script of scripts){
  if(/googletagmanager\.com|google-analytics\.com/i.test(script)){
   for(const m of script.matchAll(gaId))ids.add(m[0].toUpperCase());
   for(const m of script.matchAll(gtmId))containers.add(m[0].toUpperCase());
  }
 }
 // Inline script references cover gtag config, dataLayer and JSON embed cases.
 for(const m of scriptText.matchAll(gaId))ids.add(m[0].toUpperCase());
 for(const m of scriptText.matchAll(gtmId))containers.add(m[0].toUpperCase());
 const measurementIds=[...ids].slice(0,20),tagManagerIds=[...containers].slice(0,20);
 const status=measurementIds.length?'measurement_id_detected':tagManagerIds.length?'gtm_container_only':'not_found_in_html';
 return {
  status,measurementIds,tagManagerIds,
  method:'static_html',
  trackingActiveConfirmed:false,
  note:measurementIds.length
    ?'Measurement ID found in HTML. This does not prove tracking sends or GA4 receives events.'
    :tagManagerIds.length
    ?'A Google Tag Manager container was found, but its GA4 Measurement ID is not visible in the HTML. Browser-side or account-side inspection may be needed.'
    :'No GA4 Measurement ID or GTM container found in the initial HTML. Tag loading may be dynamic or consent-dependent.'
 };
}
