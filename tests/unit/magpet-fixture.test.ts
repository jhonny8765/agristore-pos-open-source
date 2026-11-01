import {afterEach,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
vi.mock("node:child_process",()=>({execFileSync:vi.fn()}));
import {execFileSync} from "node:child_process";
import {configureMagpetFixture} from "../integration/magpet-fixture";
const client={from:vi.fn()} as unknown as SupabaseClient;
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it("leaves ordinary integration fixtures unchanged unless explicitly armed",async()=>{
 vi.stubEnv("AGRISTORE_MAGPET_PILOT","");await configureMagpetFixture(client,{organizationId:"test",branchId:"test"});expect(execFileSync).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();
});
it.each([
 {CI:"false",AGRISTORE_LOCAL_INTEGRATION:"1",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:55321"},
 {CI:"true",AGRISTORE_LOCAL_INTEGRATION:"0",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:55321"},
 {CI:"true",AGRISTORE_LOCAL_INTEGRATION:"1",NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co"},
 {CI:"true",AGRISTORE_LOCAL_INTEGRATION:"1",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321"},
])("refuses database/browser access outside the disposable guard: %j",async env=>{
 vi.stubEnv("AGRISTORE_MAGPET_PILOT","1");for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 await expect(configureMagpetFixture(client,{organizationId:"78000000-0000-4000-8000-000000000001",branchId:"78000000-0000-4000-8000-000000000002"})).rejects.toThrow("disposable Linux/loopback");expect(execFileSync).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();
});
