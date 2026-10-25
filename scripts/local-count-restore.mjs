// Local PGlite binary-snapshot drill; not pg_dump/pg_restore or a Supabase/cloud backup test.
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {localPostgres} from './local-postgres.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fingerprintSQL} from './recovery-fingerprints.mjs';
const id=n=>`85000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let source,restored;
const ctx={organizationId:id(1),branchId:id(3)};
async function command(db,actor,action,data){
 return db.transaction(async tx=>{
  await tx.exec('set local role authenticated');
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id(actor),session_id:id(actor),role:'authenticated'})]);
  return (await tx.query('select public.agri_command($1,$2::jsonb) result',[action,JSON.stringify({...ctx,...data})])).rows[0].result;
 });
}
const first={countId:id(20),stage:'first',quantity:'10.25',notes:'TEST original sealed physical entry',observationId:id(21)};
const second={countId:id(20),stage:'recount',quantity:'10.25',notes:'TEST independently sealed recount',observationId:id(22)};
async function fingerprint(db){return (await db.query(fingerprintSQL(id(1)))).rows[0].evidence;}
try{
 source=await localPostgres();
 await source.exec(`insert into auth.users(id,email) values ${[11,12,13].map(n=>`('${id(n)}','restore-${n}@example.invalid')`).join(',')};`);
 await source.exec(`insert into auth.sessions(id,user_id) select id,id from auth.users;
  insert into public.organizations(id,name) values('${id(1)}','TEST local count restoration');
  insert into public.branches(id,organization_id,name,code) values('${id(3)}','${id(1)}','TEST restoration branch','RESTORE');
  insert into public.staff_memberships(organization_id,user_id,branch_id,role,name) values('${id(1)}','${id(11)}',null,'owner','TEST separate owner'),('${id(1)}','${id(12)}','${id(3)}','stock_staff','TEST first counter'),('${id(1)}','${id(13)}','${id(3)}','stock_staff','TEST independent counter');
  insert into public.products(id,organization_id,name,sku,base_unit) values('${id(5)}','${id(1)}','TEST feeds','RESTORE-COUNT','kg');
  insert into public.inventory_movements(organization_id,branch_id,product_id,quantity,kind,source_id,created_by) values('${id(1)}','${id(3)}','${id(5)}',10.5,'opening','${id(6)}','${id(11)}');`);
 for(const countId of [id(20),id(30)]){
  await command(source,12,'start_blind_count',{countId,productId:id(5),batchId:null,reason:'TEST recover unfinished count'});
  await command(source,12,'record_blind_count',{...first,countId,observationId:countId===id(20)?id(21):id(31)});
 }
 await command(source,13,'record_blind_count',second);
 const before=await fingerprint(source),archive=await source.dumpDataDir('none');await source.close();source=undefined;
 restored=await PGlite.create({loadDataDir:archive});assert.deepEqual(await fingerprint(restored),before);
 assert.equal((await command(restored,12,'record_blind_count',first)).duplicate,true);
 assert.equal((await command(restored,13,'record_blind_count',second)).duplicate,true);
 const workspace=await command(restored,11,'count_workspace',{});
 assert.equal(workspace.rows.find(c=>c.id===id(30)).counted,null);
 assert.equal(workspace.rows.find(c=>c.id===id(20)).counted,'10.250000');
 await command(restored,13,'record_blind_count',{...second,countId:id(30),observationId:id(32)});
 const approval={countId:id(30),reason:'TEST separate owner approves after restoration'};
 await command(restored,11,'approve_count',approval);
 assert.equal((await command(restored,11,'approve_count',approval)).duplicate,true);
 await assert.rejects(()=>command(restored,11,'approve_count',{...approval,countId:id(20)}),/Stock changed after counting/);
 assert.equal((await restored.query('select quantity::text quantity from public.branch_inventory')).rows[0].quantity,'10.250000');
 assert.equal((await restored.query("select count(*)::int n from public.inventory_movements where kind='adjustment'")).rows[0].n,1);
 await assert.rejects(()=>restored.exec(`update app_private.count_observations set quantity=1 where id='${id(21)}';`),/History is immutable/);
 const report={passed:true,scope:'Local PGlite binary snapshot with simulated Auth. Not a Supabase/cloud backup or pg_dump/pg_restore certification.',checks:['Exact sealed observations and original count metadata retained','First-only quantity stays hidden after restoration','Original request retries have no extra effects','Unfinished recount resumes under another identity','Separate owner approves exactly one adjustment','Other count becomes stale after stock changes','Sealed history remains immutable']};
 await mkdir('test-results',{recursive:true});await writeFile('test-results/local-count-restore.json',JSON.stringify(report,null,2));
 console.log('Local count snapshot/restore passed: sealed evidence, unfinished recount, original retries, separate approval, stale competing count, one adjustment, immutable observations. Simulated Auth; not a cloud restore.');
}finally{if(source)await source.close();if(restored)await restored.close();}
