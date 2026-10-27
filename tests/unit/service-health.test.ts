import {describe,it,expect,vi} from "vitest";
import {serviceHealth} from "../../apps/web/lib/service-health";
import {healthURL,probeService} from "../../scripts/service-monitor.mjs";
const healthy=()=>({service:"agristore-pos",version:1,status:"ok",release:"TEST-build",checkedAt:new Date().toISOString()});
describe("public service health preserves privacy and uncertainty",()=>{
 it("confirms a real successful boolean probe without exposing the database key",async()=>{
  const request=vi.fn(async()=>Response.json(true));const response=await serviceHealth("https://example.invalid","PRIVATE-key","TEST-build",request);
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");
  const body=await response.text();expect(body).not.toContain("PRIVATE");expect(body).not.toContain("example.invalid");expect(JSON.parse(body)).toMatchObject({status:"ok",service:"agristore-pos",version:1});
  const init=request.mock.calls[0] as unknown as [string,RequestInit];expect(init[1].redirect).toBe("error");expect(init[1].cache).toBe("no-store");expect(init[1].signal).toBeInstanceOf(AbortSignal);
 });
 it.each([undefined,""])("fails closed on missing configuration %s",async(value)=>{
  const request=vi.fn();expect((await serviceHealth(value,"KEY","TEST",request)).status).toBe(503);expect((await serviceHealth("https://example.invalid",value,"TEST",request)).status).toBe(503);expect(request).not.toHaveBeenCalled();
 });
 it.each([()=>Response.json(false),()=>Response.json({message:"PRIVATE token"},{status:401}),()=>new Response("PRIVATE upstream error",{status:500}),()=>new Response("PRIVATE HTML",{status:200})])("does not report a database failure as healthy or expose its response",async(make)=>{
  const response=await serviceHealth("https://example.invalid","KEY","TEST",async()=>make());expect(response.status).toBe(503);expect(await response.text()).not.toContain("PRIVATE");
 });
 it("turns a network timeout into a private unavailable response",async()=>{
  const response=await serviceHealth("https://example.invalid","KEY","TEST",async()=>{throw new Error("PRIVATE credential/URL timeout");});expect(response.status).toBe(503);expect(await response.text()).not.toContain("PRIVATE");
 });
});
describe("cloud availability monitor rejects false healthy pages",()=>{
 it("uses only the stable HTTPS origin",()=>{expect(healthURL("https://example.invalid/")).toBe("https://example.invalid/api/health");});
 it.each(["http://example.invalid","https://user:secret@example.invalid","https://example.invalid/path","https://example.invalid/?token=secret","https://example.invalid/#secret","invalid"])("rejects unsafe monitor target %s",value=>expect(()=>healthURL(value)).toThrow());
 it("recovers from one transient failure and sends no business credentials",async()=>{
  const request=vi.fn().mockRejectedValueOnce(new Error("PRIVATE")).mockResolvedValueOnce(Response.json(healthy()));const wait=vi.fn(async()=>{});
  expect(await probeService("https://example.invalid",{request,wait})).toEqual({ok:true,attempts:2});expect(wait).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][1].headers).toEqual({Accept:"application/json"});
 });
 it.each([()=>new Response("Login",{status:200,headers:{"content-type":"text/html"}}),()=>Response.json({...healthy(),status:"unavailable"}),()=>Response.json({...healthy(),checkedAt:new Date(Date.now()-180_000).toISOString()}),()=>Response.json({...healthy(),checkedAt:new Date(Date.now()+120_000).toISOString()}),()=>Response.json({...healthy(),service:"other-service"}),()=>Response.json(healthy(),{status:503})])("fails after three unavailable, stale or mismatched checks",async(make)=>{
  const request=vi.fn(async()=>make()),wait=vi.fn(async()=>{});expect(await probeService("https://example.invalid",{request,wait})).toEqual({ok:false,attempts:3});expect(request).toHaveBeenCalledTimes(3);expect(wait).toHaveBeenCalledTimes(2);
 });
});


describe("database-only monitoring preserves protected staging access",()=>{
 it("uses only the anonymous read-only RPC and labels scope separately",async()=>{
  const request=vi.fn(async()=>Response.json(true)),wait=vi.fn(async()=>{});
  expect(await probeService("https://example.invalid",{mode:"database",publishableKey:"sb_publishable_TEST",request,wait})).toEqual({ok:true,attempts:1});
  expect(request.mock.calls[0] as unknown).toMatchObject(["https://example.invalid/rest/v1/rpc/agri_service_health",{method:"POST",body:"{}",redirect:"error",cache:"no-store",headers:{apikey:"sb_publishable_TEST"}}]);
 });
 it.each(["","sb_secret_PRIVATE","legacy-privileged-JWT"])("rejects missing or potentially privileged key %s without making a request",async(publishableKey)=>{
  const request=vi.fn();await expect(probeService("https://example.invalid",{mode:"database",publishableKey,request})).rejects.toThrow();expect(request).not.toHaveBeenCalled();
 });
 it("rejects a normal website response as proof that the database probe ran",async()=>{
  const request=vi.fn(async()=>Response.json(healthy()));expect(await probeService("https://example.invalid",{mode:"database",publishableKey:"sb_publishable_TEST",request,wait:async()=>{}})).toEqual({ok:false,attempts:3});
 });
});
