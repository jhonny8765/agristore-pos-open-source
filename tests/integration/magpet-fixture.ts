import {execFileSync} from "node:child_process";
import type {SupabaseClient} from "@supabase/supabase-js";

const configured=new Map<string,Promise<void>>();
/** Optional disposable-CI fixture. This file is never imported by the app. */
export async function configureMagpetFixture(client:SupabaseClient,data:Record<string,unknown>){
 if(process.env.AGRISTORE_MAGPET_PILOT!=="1")return;
 if(process.env.CI!=="true"||process.platform!=="linux"||process.env.AGRISTORE_LOCAL_INTEGRATION!=="1"||process.env.NEXT_PUBLIC_SUPABASE_URL!=="http://127.0.0.1:55321")throw new Error("Magpet fixtures require the disposable Linux/loopback database");
 const org=data.organizationId,branch=data.branchId;
 if(typeof org!=="string"||typeof branch!=="string")return;
 if(!/^[0-9a-f-]{36}$/.test(org)||!/^[0-9a-f-]{36}$/.test(branch))throw new Error("Invalid disposable fixture identifiers");
 if(!configured.has(org))configured.set(org,(async()=>{
  execFileSync("docker",["exec","-i","supabase_db_agristore-pos","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{input:`begin; do $$begin if not exists(select 1 from public.branches where organization_id='${org}' and id='${branch}') then raise exception 'Fixture branch does not belong to the TEST organization'; end if; end$$; update public.branches set active=(id='${branch}'),management_locked=true,name=case when id='${branch}' then 'Magpet Branch' else name end where organization_id='${org}'; commit;`,stdio:["pipe","pipe","pipe"]});
  const result=await client.from("branches").select("id,name,management_locked").eq("organization_id",org);
  if(result.error||result.data?.length!==1||result.data[0].id!==branch||result.data[0].name!=="Magpet Branch"||!result.data[0].management_locked)throw new Error("Magpet fixture was not confirmed through the authenticated API");
 })());
 await configured.get(org);
}
