/**
 * Passive discovery in machine-readable initial HTML only.
 * This never executes JavaScript or proves GA4 event delivery.
 */
export function detectGoogleTags(html){
 const source=String(html||'').slice(0,524288);
 const gaId=/\bG-[A-Z0-9]{5,20}\b/gi;
 const gtmId=/\bGTM-[A-Z0-9]{4,20}\b/gi;
 // Look at script contents and HTML tags (including preload links and
 // data attributes). Ignore visible prose that might merely discuss GA4.
 const scriptBodies=[...source.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(m=>m[0]);
 const htmlTags=[...source.matchAll(/<[^>]+>/g)].map(m=>m[0]);
 const normalized=[...scriptBodies,...htmlTags].join('\n')
  .replace(/\\u002[dD]/g,'-').replace(/&#(?:45|x2d);/gi,'-').replace(/%2d/gi,'-');
 const measurementIds=[...new Set([...normalized.matchAll(gaId)].map(m=>m[0].toUpperCase()))].slice(0,20);
 const tagManagerIds=[...new Set([...normalized.matchAll(gtmId)].map(m=>m[0].toUpperCase()))].slice(0,20);
 const status=measurementIds.length?'measurement_id_detected':tagManagerIds.length?'gtm_container_only':'not_found_in_html';
 return {
  status,measurementIds,tagManagerIds,
  method:'static_html',trackingActiveConfirmed:false,
  detectionScope:'initial_html_only',
  note:measurementIds.length
   ?'GA4 Measurement ID referenced in initial HTML. This does not prove that events are sent or received.'
   :tagManagerIds.length
   ?'Google Tag Manager is referenced in initial HTML, but the GA4 Measurement ID may be inside its container or loaded at runtime.'
   :'No GA4 Measurement ID or GTM container found in initial HTML. Client-side, consent-gated or externally loaded tags require runtime browser inspection.'
 };
}
