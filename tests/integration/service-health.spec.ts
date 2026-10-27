import {test,expect} from "@playwright/test";
test("public health verifies the real database without login or exposing business records",async({request})=>{
 const response=await request.get("/api/health");expect(response.status()).toBe(200);expect(response.headers()["cache-control"]).toContain("no-store");
 const body=await response.json();expect(Object.keys(body).sort()).toEqual(["checkedAt","release","service","status","version"]);expect(body).toMatchObject({service:"agristore-pos",status:"ok",version:1});expect(body.release).toBeTruthy();expect(Math.abs(Date.now()-Date.parse(body.checkedAt))).toBeLessThan(30_000);
 expect((await request.post("/api/health",{data:{}})).status()).toBe(405);
});
