import {cloudflareHealth,hostingHeaders} from "./cloudflare-host";

declare const PUBLIC_API_URL:string|undefined;
declare const PUBLIC_API_KEY:string|undefined;
declare const APP_RELEASE:string;

const worker = {
  async fetch(request:Request,env:{ASSETS:{fetch(request:Request):Promise<Response>}}) {
    const pathname=new URL(request.url).pathname;
    if(["/_worker.js","/_headers","/_routes.json"].includes(pathname)) {
      return new Response(null,{status:404,headers:{...hostingHeaders(PUBLIC_API_URL),"Cache-Control":"no-store"}});
    }
    if(pathname==="/api/health") {
      return cloudflareHealth(request,PUBLIC_API_URL,PUBLIC_API_KEY,APP_RELEASE);
    }
    return env.ASSETS.fetch(request);
  },
};
export default worker;
