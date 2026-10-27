import {serviceHealth} from "../../../lib/service-health";
export const dynamic="force-dynamic";
export const maxDuration=10;
export async function GET(){
  return serviceHealth(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_APP_RELEASE??"unknown-build");
}
