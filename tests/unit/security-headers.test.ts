import {describe,it,expect} from "vitest";
import {contentSecurityPolicy} from "../../apps/web/lib/security-headers";
describe("static offline application security policy",()=>{
 it("restricts connections to this app and its configured database",()=>{const p=contentSecurityPolicy("https://example.supabase.co/");expect(p).toContain("connect-src 'self' https://example.supabase.co wss://example.supabase.co;");expect(p).toContain("object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");expect(p).toContain("worker-src 'self'");expect(p).not.toContain("unsafe-eval");expect(p).not.toContain("https:;");});
 it("supports disposable loopback tests without allowing arbitrary insecure servers",()=>{expect(contentSecurityPolicy("http://127.0.0.1:55321")).toContain("http://127.0.0.1:55321 ws://127.0.0.1:55321");expect(()=>contentSecurityPolicy("http://example.com")).toThrow();});
 it.each(["https://user:secret@example.com","https://example.com/path","https://example.com/?token=secret","https://example.com/#fragment","file:///tmp/db"])("rejects non-origin API configuration %s",url=>expect(()=>contentSecurityPolicy(url)).toThrow());
 it("allows development evaluation only in development and never invents an API origin",()=>{expect(contentSecurityPolicy(undefined,true)).toContain("'unsafe-eval'");expect(contentSecurityPolicy()).toContain("connect-src 'self';");});
});
