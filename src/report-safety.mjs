/** Remove query strings, fragments, passwords and credential-shaped text from evidence. */
export function safeReportUrl(raw,maxLength=500){
 try{
  const url=new URL(raw);
  if(!['https:','http:'].includes(url.protocol))return '[redacted-url]';
  const path=url.pathname.replace(/[\u0000-\u001f]/g,'');
  return (url.origin+path).slice(0,maxLength);
 }catch{return '[invalid-url]';}
}
export function safeReportMessage(value,maxLength=500){
 const text=String(value??'');
 return text.replace(/https?:\/\/[^\s"'<>]+/gi,found=>safeReportUrl(found))
  .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
  .replace(/\b(?:api_secret|access_token|password|authorization|token)\s*[=:]\s*[^\s,;]+/gi,'credential=[redacted]')
  .slice(0,maxLength);
}
