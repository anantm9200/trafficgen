/** Do not retain sensitive query parameters or URL fragments in synthetic QA evidence. */
export function safeReportUrl(raw,maxLength=500){
 try{
  const u=new URL(raw);
  if(!['https:','http:'].includes(u.protocol))return '[redacted-url]';
  return (u.origin+u.pathname.replace(/[\u0000-\u001f]/g,'')).slice(0,maxLength);
 }catch{return '[invalid-url]';}
}
export function safeReportMessage(value,maxLength=500){
 return String(value??'')
  .replace(/https?:\/\/[^\s"'<>]+/gi,x=>safeReportUrl(x))
  .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
  .replace(/\b(?:api_secret|access_token|password|authorization|token)\s*[=:]\s*[^\s,;]+/gi,'credential=[redacted]')
  .slice(0,maxLength);
}
