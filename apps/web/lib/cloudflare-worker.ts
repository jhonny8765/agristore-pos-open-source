import {cloudflareHealth} from "./cloudflare-host";

declare const PUBLIC_API_URL:string|undefined;
declare const PUBLIC_API_KEY:string|undefined;
declare const APP_RELEASE:string;

const worker = {
  async fetch(request:Request,env:{ASSETS:{fetch(request:Request):Promise<Response>}}) {
    if(new URL(request.url).pathname==="/api/health") {
      return cloudflareHealth(request,PUBLIC_API_URL,PUBLIC_API_KEY,APP_RELEASE);
    }
    return env.ASSETS.fetch(request);
  },
};
export default worker;
