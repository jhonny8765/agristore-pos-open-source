import {randomUUID} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
type Business={owner:SupabaseClient;organizationId:string;branchId:string};
export async function countCommand<T=Record<string,unknown>>(client:SupabaseClient,action:string,data:Record<string,unknown>):Promise<T>{
 const response=await client.rpc('agri_command',{action,data});
 if(response.error)throw new Error(`${action}: ${response.error.message}`);
 return response.data as T;
}
export async function testCountStaff(a:Business,branchId=a.branchId,name='TEST independent counter'){
 if(process.env.AGRISTORE_LOCAL_INTEGRATION!=='1' || process.env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:55321')throw new Error('Disposable local count fixtures only');
 const user=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email=`count-${randomUUID()}@example.invalid`,password=`TEST-${randomUUID()}!`;
 const response=await user.auth.signUp({email,password});
 if(response.error || !response.data.session)throw new Error('Disposable counter signup failed');
 await countCommand(a.owner,'staff_access',{organizationId:a.organizationId,branchId,email,name,role:'stock_staff'});
 return {owner:user,email,password,userId:response.data.user!.id};
}
const teams=new WeakMap<SupabaseClient,Map<string,Promise<Awaited<ReturnType<typeof testCountStaff>>[]>>>();
export async function sealedCount(a:Business,data:Record<string,unknown>){
 const branchId=String(data.branchId ?? a.branchId);
 let byBranch=teams.get(a.owner);if(!byBranch){byBranch=new Map();teams.set(a.owner,byBranch);}
 if(!byBranch.has(branchId))byBranch.set(branchId,Promise.all([testCountStaff(a,branchId,'TEST first counter'),testCountStaff(a,branchId,'TEST independent counter')]));
 const [first,second]=await byBranch.get(branchId)!;
 const body={...data,organizationId:a.organizationId,branchId,countId:data.countId ?? randomUUID()};
 await countCommand(first.owner,'start_blind_count',body);
 for(const [staff,stage] of [[first,'first'],[second,'recount']] as const)
  await countCommand(staff.owner,'record_blind_count',{...body,stage,quantity:String(data.counted),notes:data.reason,observationId:randomUUID()});
 return body.countId;
}
