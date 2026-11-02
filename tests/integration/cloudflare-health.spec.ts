import {test,expect} from "@playwright/test";

test("Cloudflare health checks the real disposable database through its public read-only probe",async({request})=>{
  test.skip(process.env.AGRISTORE_HOSTING_TARGET!=="cloudflare","Cloudflare-specific live backend check.");
  const response=await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body=await response.json();expect(body).toMatchObject({service:"agristore-pos",status:"ok",version:1});
  expect(body.release).toMatch(/^cf-/);expect(Math.abs(Date.now()-Date.parse(body.checkedAt))).toBeLessThan(30_000);
  expect(JSON.stringify(body)).not.toContain("supabase");expect(JSON.stringify(body)).not.toContain("sb_");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const head=await request.head("/api/health");expect(head.status()).toBe(200);expect((await head.body()).length).toBe(0);
  const rejected=await request.post("/api/health");expect(rejected.status()).toBe(405);expect(rejected.headers().allow).toBe("GET, HEAD");
});
