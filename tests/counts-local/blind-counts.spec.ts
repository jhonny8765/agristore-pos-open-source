import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({request})=>{expect((await request.post('/__test/reset')).ok()).toBe(true);});
test('actual count component and SQL rules complete blind entry, independent recount and owner approval with simulated identities',async({page,context})=>{
 await page.goto('/first/');await page.getByLabel('Counting scope / reason',{exact:true}).fill('TEST end-of-day loose feeds');await page.getByRole('button',{name:'Start blind count',exact:true}).click();
 const first=page.locator('.count-record');await expect(first.getByRole('button',{name:'Seal first count',exact:true})).toBeVisible();await expect(page.locator('.count-comparison')).toHaveCount(0);
 for(const [width,height] of [[1440,1000],[390,844],[1280,720]]){
  await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).include('.blind-counts').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`.impeccable/review/blind-counts-entry-${width}.png`,fullPage:true});
 }
 await first.getByLabel('First physical quantity (kg)',{exact:true}).fill('10.25');await first.getByLabel('First count notes',{exact:true}).fill('TEST physical net weight after tare');await first.getByRole('button',{name:'Seal first count',exact:true}).click();await expect(first).toContainText('Another signed-in person must recount');
 const second=await context.newPage();await second.goto('/second/');await expect(second.locator('.count-comparison')).toHaveCount(0);
 await second.getByLabel('Independent recount quantity (kg)',{exact:true}).fill('10.25');await second.getByLabel('Independent recount notes',{exact:true}).fill('TEST independent net weight after tare');await second.getByRole('button',{name:'Seal independent recount',exact:true}).click();await expect(second.locator('.count-record')).toContainText('Ready for owner review');
 const owner=await context.newPage();await owner.goto('/owner/');await owner.getByRole('button',{name:'Review sealed counts',exact:true}).click();const record=owner.locator('.count-record');await expect(record).toContainText('10.5 kg');await expect(record).toContainText('-0.25 kg');
 await record.getByRole('button',{name:'Approve adjustment',exact:true}).click();await record.getByLabel('Approval evidence',{exact:true}).fill('TEST inspected two independent sealed entries');
 for(const [width,height] of [[1440,1000],[390,844],[1280,720]]){
  await owner.setViewportSize({width,height});expect(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page:owner}).include('.blind-counts').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await owner.screenshot({path:`.impeccable/review/blind-counts-review-${width}.png`,fullPage:true});
 }
 await record.getByRole('button',{name:'Confirm adjustment',exact:true}).click();await expect(record.getByText('Approved',{exact:true})).toBeVisible();await owner.reload();await owner.getByRole('button',{name:'Review sealed counts',exact:true}).click();await expect(owner.locator('.count-record').getByText('Approved',{exact:true})).toBeVisible();
});
test('committed first-count response loss retains a recoverable original request',async({page})=>{
 await page.goto('/first/');await page.getByLabel('Counting scope / reason',{exact:true}).fill('TEST lost first response');await page.getByRole('button',{name:'Start blind count',exact:true}).click();
 let interrupted=false;await page.route('**/__test/command',async route=>{
  if(route.request().postDataJSON().action==='record_blind_count'&&!interrupted){const response=await route.fetch();expect(response.ok()).toBe(true);interrupted=true;await route.abort('failed');}else await route.continue();
 });
 await page.getByLabel('First physical quantity (kg)',{exact:true}).fill('10.25');await page.getByLabel('First count notes',{exact:true}).fill('TEST preserve original immutable request');await page.getByRole('button',{name:'Seal first count',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry original request',exact:true})).toBeVisible();await expect(page.getByLabel('First physical quantity (kg)',{exact:true})).toHaveValue('10.25');
 await page.getByRole('button',{name:'Retry original request',exact:true}).click();await expect(page.getByRole('button',{name:'Retry original request',exact:true})).toHaveCount(0);await expect(page.locator('.count-record')).toContainText('Independent recount needed');await page.reload();await expect(page.locator('.count-record')).toContainText('Independent recount needed');
});
test('an unresolved recorded lot keeps its identifier and wraps at narrow width',async({page,request})=>{
 const id=(n:number)=>`75000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const response=await request.post('/__test/command',{headers:{'X-Count-Test-Actor':'first'},data:{action:'start_blind_count',data:{organizationId:id(1),branchId:id(3),countId:id(101),productId:id(5),batchId:id(7),reason:'TEST recorded lot missing from downloaded catalog'}}});expect(response.ok()).toBe(true);
 await page.setViewportSize({width:390,height:844});await page.goto('/first/');const row=page.locator('.count-record');
 await expect(row).toContainText(`Recorded lot ${id(7)}`);await expect(row).toContainText('Expiry unavailable');await expect(row).not.toContainText('No lot');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.impeccable/review/blind-counts-recorded-lot-390.png',fullPage:true});
});
