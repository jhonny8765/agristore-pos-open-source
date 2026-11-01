// This static PWA needs Next's inline bootstrap and inline receipt/chart styles.
// A per-request nonce would break the cached application shell. Keep that
// limitation explicit rather than claiming this is a strict nonce-based CSP.
export function contentSecurityPolicy(apiURL?:string,development=false){
 const connections=["'self'"];
 if(apiURL){
  const url=new URL(apiURL);
  if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||!(url.protocol==="https:"||url.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(url.hostname)))throw new Error("Use a plain HTTPS Supabase origin, or the disposable loopback test origin.");
  connections.push(url.origin,url.origin.replace(/^http/,"ws"));
 }
 if(development)connections.push("ws://127.0.0.1:*","ws://localhost:*");
 return [
  "default-src 'self'",`script-src 'self' 'unsafe-inline'${development?" 'unsafe-eval'":""}`,
  "style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self' data:",
  `connect-src ${connections.join(" ")}`,"worker-src 'self'","manifest-src 'self'",
  "object-src 'none'","base-uri 'none'","form-action 'self'","frame-ancestors 'none'",
 ].join("; ");
}
