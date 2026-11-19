// Stable identity: a retry may refresh its proof token or normalization timestamp,
// but must not silently change the website or work associated with a run UUID.
export function runFingerprint(plan){
 if(!plan||typeof plan!=='object')throw new Error('Run plan required');
 const fields=['runId','name','targetUrl','verificationMethod','sessions','concurrency',
  'intervalSeconds','dwellSeconds','maxPages','countries','devices','browser',
  'interactions','analytics','journeyExecutionMode','requestedJourney'];
 const canonical=Object.fromEntries(fields.map(k=>[k,plan[k]??null]));
 return JSON.stringify(canonical);
}
export function sameRunIdentity(a,b){return runFingerprint(a)===runFingerprint(b)}
