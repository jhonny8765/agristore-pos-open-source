import {contentSecurityPolicy} from "./security-headers";
import {serviceHealth} from "./service-health";

export function hostingHeaders(url?:string) {
  return {
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"strict-origin-when-cross-origin",
    "X-Frame-Options":"DENY",
    "Content-Security-Policy":contentSecurityPolicy(url),
    "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security":"max-age=31536000",
  };
}

export function pagesHeaders(url?:string) {
  return `/*\n${Object.entries(hostingHeaders(url)).map(([key,value])=>`  ${key}: ${value}`).join("\n")}\n\n/sw.js\n  Cache-Control: no-store, max-age=0\n  Service-Worker-Allowed: /\n\n/\n  Cache-Control: no-cache\n\n/index.html\n  Cache-Control: no-cache\n`;
}

export async function cloudflareHealth(request:Request,url:string|undefined,key:string|undefined,release:string,fetcher:typeof fetch=fetch) {
  let response:Response;
  if(request.method!=="GET"&&request.method!=="HEAD") {
    response=new Response(null,{status:405,headers:{Allow:"GET, HEAD","Cache-Control":"no-store, max-age=0"}});
  } else {
    // Workers rejects redirect:"error" at Request construction. Manual mode
    // also prevents forwarding the public key to a redirected destination;
    // the shared health probe rejects the resulting non-2xx response.
    response=await serviceHealth(url,key,release,(input,init)=>fetcher(input,{...init,redirect:"manual"}));
  }
  const headers=new Headers(response.headers);
  for(const [name,value] of Object.entries(hostingHeaders(url))) headers.set(name,value);
  return new Response(request.method==="HEAD"?null:response.body,{status:response.status,headers});
}
