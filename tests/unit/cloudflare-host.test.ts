import {describe,it,expect,vi} from "vitest";
import {cloudflareHealth,pagesHeaders,hostingHeaders} from "../../apps/web/lib/cloudflare-host";
import {publicBackend} from "../../scripts/cloudflare-config.mjs";

describe("Cloudflare serves a live, private health check",()=>{
  it("checks the backend anew for each request and applies the same security policy as static pages",async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(false));
    const first=await cloudflareHealth(new Request("https://pos.example/api/health"),"https://backend.example","sb_publishable_TEST","cf-TEST",fetcher);
    const second=await cloudflareHealth(new Request("https://pos.example/api/health"),"https://backend.example","sb_publishable_TEST","cf-TEST",fetcher);
    expect(first.status).toBe(200);expect(second.status).toBe(503);expect(fetcher).toHaveBeenCalledTimes(2);
    for(const [name,value] of Object.entries(hostingHeaders("https://backend.example"))) expect(first.headers.get(name)).toBe(value);
    const body=await first.text();expect(body).not.toContain("sb_publishable");expect(body).not.toContain("backend.example");
    expect(first.headers.get("cache-control")).toContain("no-store");
  });
  it("HEAD checks availability with no response body",async()=>{
    const fetcher=vi.fn(async()=>Response.json(true));
    const response=await cloudflareHealth(new Request("https://pos.example/api/health",{method:"HEAD"}),"https://backend.example","sb_publishable_TEST","TEST",fetcher);
    expect(response.status).toBe(200);expect(await response.text()).toBe("");expect(fetcher).toHaveBeenCalledOnce();
  });
  it("uses Workers-supported manual redirects and never follows an upstream redirect",async()=>{
    const fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      expect(init?.redirect).toBe("manual");expect(init?.cache).toBe("no-store");
      return new Response(null,{status:302,headers:{Location:"https://foreign.example"}});
    });
    const response=await cloudflareHealth(new Request("https://pos.example/api/health"),"https://backend.example","sb_publishable_TEST","TEST",fetcher);
    expect(response.status).toBe(503);expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each(["POST","PUT","DELETE","OPTIONS"])("rejects %s without invoking the database",async method=>{
    const fetcher=vi.fn();
    const response=await cloudflareHealth(new Request("https://pos.example/api/health",{method}),undefined,undefined,"TEST",fetcher);
    expect(response.status).toBe(405);expect(response.headers.get("allow")).toBe("GET, HEAD");expect(fetcher).not.toHaveBeenCalled();
  });
  it("unconnected builds fail closed and preserve service-worker update caching policy",async()=>{
    const response=await cloudflareHealth(new Request("https://pos.example/api/health"),undefined,undefined,"TEST");
    expect(response.status).toBe(503);
    expect(pagesHeaders()).toContain("/sw.js\n  Cache-Control: no-store, max-age=0\n  Service-Worker-Allowed: /");
    expect(pagesHeaders()).not.toContain("unsafe-eval");
  });
});
describe("deployment credentials are public and explicit",()=>{
  it("requires configuration except in an explicit empty practice build",()=>{
    expect(()=>publicBackend({})).toThrow();expect(publicBackend({},true)).toEqual({url:undefined,key:undefined});
    expect(()=>publicBackend({NEXT_PUBLIC_SUPABASE_URL:"https://example.invalid"},true)).toThrow();
  });
  it.each(["sb_secret_PRIVATE","unknown-key",`x.${Buffer.from(JSON.stringify({role:"service_role"})).toString("base64url")}.x`])("rejects privileged or unrecognized credentials",key=>{
    expect(()=>publicBackend({NEXT_PUBLIC_SUPABASE_URL:"https://example.invalid",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key})).toThrow();
  });
  it.each(["http://example.invalid","https://user:pass@example.invalid","https://example.invalid/path","https://example.invalid/?key=private"])("rejects unsafe backend URL %s",url=>{
    expect(()=>publicBackend({NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_TEST"})).toThrow();
  });
  it("allows public keys and a loopback-only local test backend",()=>{
    const anon=`x.${Buffer.from(JSON.stringify({role:"anon"})).toString("base64url")}.x`;
    expect(publicBackend({NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:55321",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:anon}).key).toBe(anon);
    expect(publicBackend({NEXT_PUBLIC_SUPABASE_URL:"https://example.invalid",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_TEST"}).key).toBe("sb_publishable_TEST");
  });
});
