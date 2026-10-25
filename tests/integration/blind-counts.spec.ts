import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {countCommand,testCountStaff} from './blind-count-fixtures';
import type {BlindCount} from '../../apps/web/lib/blind-counts';

async function fixture(){
 if(process.env.AGRISTORE_LOCAL_INTEGRATION!=='1' || process.env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:55321')throw new Error('Disposable local count tests only');
 const owner=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email=`count-owner-${randomUUID()}@example.invalid`,password=`TEST-${randomUUID()}!`;
 const signup=await owner.auth.signUp({email,password});expect(signup.error).toBeNull();expect(signup.data.session).not.toBeNull();
 const {organizationId}=await countCommand<{organizationId:string}>(owner,'bootstrap',{name:'TEST blind count rehearsal',ownerName:'TEST approving owner'});
 const branches=await owner.from('branches').select('id').eq('organization_id',organizationId).order('code');expect(branches.error).toBeNull();
 const branchId=branches.data![0].id as string;
 const {id:productId}=await countCommand<{id:string}>(owner,'create_product',{organizationId,branchId,name:'TEST blind feeds',sku:'BLIND-FEEDS',category:'Feeds',baseUnit:'kg',minimumStock:'0',tracksExpiry:false,units:[{name:'Kilo',factor:'1',price:3500,cost:2500}]});
 const units=await owner.from('product_units').select('id').eq('product_id',productId).single();expect(units.error).toBeNull();
 await countCommand(owner,'receive_stock',{organizationId,branchId,receiptId:randomUUID(),source:'purchase',reference:'TEST physical count fixture',items:[{productId,unitId:units.data!.id,quantity:'10.5',lot:'',expiresOn:null}]});
 const a={owner,email,password,organizationId,branchId,productId};
 const first=await testCountStaff(a,branchId,'TEST first counter'),second=await testCountStaff(a,branchId,'TEST independent counter');
 return {...a,first,second};
}
async function login(page:Page,account:{email:string;password:string}){
 await page.goto('/');await page.getByLabel('Email address',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Stock counts',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Stock counts',exact:true}).click();await expect(page.getByRole('heading',{name:'Blind stock counts',exact:true})).toBeVisible();
}
test('blind first entry, independent recount and third-person owner approval complete through separate signed-in browsers',async({page,browser})=>{
 const a=await fixture();const context2=await browser.newContext(),context3=await browser.newContext();
 const recounter=await context2.newPage(),approver=await context3.newPage();
 try{
  await login(page,a.first);
  await page.getByLabel('Counting scope / reason',{exact:true}).fill('TEST loose feeds after closed shifts');await page.getByRole('button',{name:'Start blind count',exact:true}).click();
  const first=page.locator('.count-record');await expect(first.getByRole('button',{name:'Seal first count',exact:true})).toBeVisible();
  await expect(page.locator('.count-comparison')).toHaveCount(0);await expect(page.locator('.history-register')).toHaveCount(0);
  for(const [width,height] of [[1440,1000],[390,844],[1280,720]]){
   await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const scan=await new AxeBuilder({page}).include('.blind-counts').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(scan.violations).toEqual([]);
   await page.screenshot({path:`test-results/blind-counts-entry-${width}.png`,fullPage:true});
  }
  await first.getByLabel('First physical quantity (kg)',{exact:true}).fill('10.25');await first.getByLabel('First count notes',{exact:true}).fill('TEST independently weighed loose goods');
  await first.getByRole('button',{name:'Seal first count',exact:true}).click();await expect(first).toContainText('Another signed-in person must recount.');
  const ctx={organizationId:a.organizationId,branchId:a.branchId};
  const pending=await countCommand<{rows:BlindCount[]}>(a.second.owner,'count_workspace',ctx);const countId=pending.rows[0].id;
  expect(pending.rows[0]).toMatchObject({expected:null,counted:null,recounted:null,firstNotes:null});
  const bypass=await a.first.owner.rpc('agri_command',{action:'record_blind_count',data:{...ctx,countId,stage:'recount',quantity:'10.25',notes:'TEST forged second person',observationId:randomUUID(),recounterId:a.second.userId}});expect(bypass.error?.code).toBe('42501');
  const exposed=await a.second.owner.from('stock_counts').select('*').eq('organization_id',a.organizationId);expect(exposed.data).toEqual([]);
  await login(recounter,a.second);await expect(recounter.locator('.count-comparison')).toHaveCount(0);
  await recounter.getByLabel('Independent recount quantity (kg)',{exact:true}).fill('10.25');await recounter.getByLabel('Independent recount notes',{exact:true}).fill('TEST second checked scale and tare independently');
  await recounter.getByRole('button',{name:'Seal independent recount',exact:true}).click();await expect(recounter.getByText('Ready for owner review',{exact:true})).toBeVisible();
  await login(approver,a);await approver.getByRole('button',{name:'Review sealed counts',exact:true}).click();
  const record=approver.locator('.count-record');await expect(record).toContainText('10.5 kg');await expect(record).toContainText('10.25 kg');await expect(record).toContainText('-0.25 kg');
  await record.getByRole('button',{name:'Approve adjustment',exact:true}).click();await record.getByLabel('Approval evidence',{exact:true}).fill('TEST inspected both independent signed-in count records');
  for(const [width,height] of [[1440,1000],[390,844],[1280,720]]){
   await approver.setViewportSize({width,height});expect(await approver.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const scan=await new AxeBuilder({page:approver}).include('.blind-counts').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(scan.violations).toEqual([]);
   await approver.screenshot({path:`test-results/blind-counts-review-${width}.png`,fullPage:true});
  }
  await record.getByRole('button',{name:'Confirm adjustment',exact:true}).click();await expect(record.getByText('Approved',{exact:true})).toBeVisible();
  const inventory=await a.owner.from('branch_inventory').select('quantity').eq('branch_id',a.branchId).eq('product_id',a.productId).single();expect(Number(inventory.data!.quantity)).toBe(10.25);
  const approvals=await a.owner.from('adjustment_approvals').select('approved_by,reason').eq('count_id',countId);expect(approvals.data).toHaveLength(1);
  const original={...ctx,countId,reason:'TEST inspected both independent signed-in count records'};
  const retries=await Promise.all([countCommand(a.owner,'approve_count',original),countCommand(a.owner,'approve_count',original)]);expect(retries.every(r=>r.duplicate===true)).toBe(true);
  const movements=await a.owner.from('inventory_movements').select('id').eq('source_id',countId);expect(movements.data).toHaveLength(1);
 }finally{await context2.close();await context3.close();}
});

test('lost sealed-count response recovers its original observation without a second entry',async({page})=>{
 const a=await fixture(),ctx={organizationId:a.organizationId,branchId:a.branchId},countId=randomUUID();
 await countCommand(a.first.owner,'start_blind_count',{...ctx,countId,productId:a.productId,batchId:null,reason:'TEST lost sealed response'});
 await login(page,a.first);let committed=false;
 await page.route('**/rest/v1/rpc/agri_command',async route=>{
  if(route.request().postDataJSON().action==='record_blind_count'&&!committed){const response=await route.fetch();expect(response.ok()).toBe(true);committed=true;await route.abort('failed');}else await route.continue();
 });
 await page.getByLabel('First physical quantity (kg)',{exact:true}).fill('10.25');await page.getByLabel('First count notes',{exact:true}).fill('TEST retain immutable response retry');
 await page.getByRole('button',{name:'Seal first count',exact:true}).click();await expect.poll(()=>committed).toBe(true);
 await page.getByRole('button',{name:/Sync center/}).click();await expect(page.getByRole('button',{name:'Retry original request',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry original request',exact:true}).click();await expect(page.getByRole('button',{name:'Retry original request',exact:true})).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Stock counts',exact:true}).click();await expect(page.locator('.count-record')).toContainText('Independent recount needed');
 const result=await countCommand<{rows:BlindCount[]}>(a.second.owner,'count_workspace',ctx);expect(result.rows).toHaveLength(1);expect(result.rows[0].counted).toBeNull();
 const history=await a.owner.from('audit_events').select('id').eq('source_id',countId).eq('action','record_blind_count');expect(history.data).toHaveLength(1);
});
