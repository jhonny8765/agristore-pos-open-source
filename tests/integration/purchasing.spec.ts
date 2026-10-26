import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { countCommand, testCountStaff } from "./blind-count-fixtures";
import type { PurchasingWorkspace } from "../../apps/web/lib/purchasing";
async function fixture() {
  if(process.env.AGRISTORE_LOCAL_INTEGRATION!=="1"||process.env.NEXT_PUBLIC_SUPABASE_URL!=="http://127.0.0.1:55321") throw new Error("Disposable loopback purchasing fixtures only");
  const owner=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=`purchasing-${randomUUID()}@example.invalid`,password=`TEST-${randomUUID()}!`;
  const signup=await owner.auth.signUp({email,password});expect(signup.error).toBeNull();
  const {organizationId}=await countCommand<{organizationId:string}>(owner,"bootstrap",{name:"TEST purchase inspections",ownerName:"TEST purchasing owner"});
  const branches=await owner.from("branches").select("id").eq("organization_id",organizationId).order("code");expect(branches.error).toBeNull();const branchId=branches.data![0].id as string,ctx={organizationId,branchId};
  const {id:supplierId}=await countCommand<{id:string}>(owner,"create_supplier",{...ctx,name:"TEST inspection supplier",contact:"TEST receiving desk"});
  const {id:productId}=await countCommand<{id:string}>(owner,"create_product",{...ctx,name:"TEST inspected feeds",sku:"TEST-INSPECT",category:"Feeds",baseUnit:"kg",minimumStock:"0",units:[{name:"Sack",factor:"50",price:150000,cost:120000}]});
  const units=await owner.from("product_units").select("id").eq("product_id",productId).single();expect(units.error).toBeNull();
  return {owner,email,password,organizationId,branchId,ctx,supplierId,productId,unitId:units.data!.id as string};
}
async function login(page:Page,a:{email:string;password:string}){
  await page.goto("/");await page.getByLabel("Email address",{exact:true}).fill(a.email);await page.getByLabel("Password",{exact:true}).fill(a.password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.getByRole("button",{name:"Purchasing",exact:true}).click();await expect(page.getByRole("heading",{name:"Purchase orders",exact:true})).toBeVisible();
}
async function fillDelivery(page:Page,orderId:string,reference:string,accepted="0",held="0",rejected="10"){
  await page.getByLabel("Delivery purchase order",{exact:true}).selectOption(orderId);
  await page.getByLabel("Supplier inspection document reference",{exact:true}).fill(reference);
  await page.getByLabel("Delivery inspection explanation",{exact:true}).fill("TEST actual delivery counted and inspected");
  for(const [label,value] of [["Supplier document quantity 1","10"],["Accepted saleable quantity 1",accepted],["Held quantity 1",held],["Rejected quantity 1",rejected],["Inspection difference evidence 1","TEST damaged packaging and supplier shortage"]])await page.getByLabel(label,{exact:true}).fill(value);
}
test("owner-approved order supports fully rejected and mixed deliveries, held return, claim resolution and accessible exports",async({page,browser})=>{
  const a=await fixture();await login(page,a);
  await page.getByText("Request a purchase order",{exact:true}).click();
  await page.getByLabel("Order supplier",{exact:true}).selectOption(a.supplierId);await page.getByLabel("Purchase order reference",{exact:true}).fill("TEST-PO-001");await page.getByLabel("Order explanation",{exact:true}).fill("TEST order ten sacks");await page.getByLabel("Ordered product / unit 1",{exact:true}).selectOption(a.unitId);await page.getByLabel("Ordered quantity 1",{exact:true}).fill("10");
  await page.getByRole("button",{name:"Save order request",exact:true}).click();
  const orders=page.getByRole("region",{name:"Purchase order register",exact:true});await expect(orders).toContainText("Awaiting owner approval");
  await orders.getByRole("button",{name:"Approve purchase order",exact:true}).click();await page.getByLabel("Order approval / closure evidence",{exact:true}).fill("TEST supplier and quantity verified by owner");await page.getByRole("button",{name:"Approve order",exact:true}).click();await expect(orders).toContainText("Approved / open");
  const workspace=await countCommand<PurchasingWorkspace>(a.owner,"purchasing_workspace",a.ctx),orderId=workspace.orders[0].id;
  const staff=await testCountStaff(a,a.branchId,"TEST delivery inspector"),context=await browser.newContext();
  try{
    const employee=await context.newPage();await login(employee,staff);await expect(employee.getByRole("button",{name:"Approve purchase order",exact:true})).toHaveCount(0);await expect(employee.getByRole("button",{name:"Receive stock",exact:true})).toBeDisabled();
    await fillDelivery(employee,orderId,"TEST-REJECTED-001");await employee.getByRole("button",{name:"Save delivery inspection",exact:true}).click();
    await expect(employee.getByRole("region",{name:"Inspected delivery register",exact:true})).toContainText("TEST-REJECTED-001");
    const stock=await a.owner.from("branch_inventory").select("quantity").eq("product_id",a.productId).eq("branch_id",a.branchId);expect(stock.error).toBeNull();expect(stock.data).toHaveLength(0);
  }finally{await context.close();}
  await page.getByRole("button",{name:"Refresh purchasing records",exact:true}).click();await fillDelivery(page,orderId,"TEST-MIXED-002","6","1","2");
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include(".purchasing-workspace").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({path:`test-results/purchasing-${width}.png`,fullPage:true});
  }
  await page.getByRole("button",{name:"Save delivery inspection",exact:true}).click();
  const deliveries=page.getByRole("region",{name:"Inspected delivery register",exact:true});await expect(deliveries).toContainText("TEST-MIXED-002");await expect(deliveries).toContainText("Physical total: 9");
  const stock=await a.owner.from("branch_inventory").select("quantity").eq("product_id",a.productId).eq("branch_id",a.branchId);expect(Number(stock.data![0].quantity)).toBe(300);
  await page.getByRole("button",{name:"Inventory",exact:true}).click();await page.getByRole("button",{name:"Record held-goods outcome",exact:true}).click();
  await page.getByLabel("Quantity from held stock (base units)",{exact:true}).fill("50");await page.getByLabel("Held-goods outcome",{exact:true}).selectOption("supplier_return");await page.getByLabel("Inspection / disposition reason",{exact:true}).fill("TEST supplier signed return of held sack");await page.getByRole("button",{name:"Record outcome",exact:true}).click();await expect(page.getByText("No held goods loaded.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Purchasing",exact:true}).click();
  const mixed=page.getByRole("region",{name:"Inspected delivery register",exact:true}).getByRole("row").filter({hasText:"TEST-MIXED-002"});await mixed.getByRole("button",{name:"Record supplier-claim evidence",exact:true}).click();
  await mixed.getByLabel("Supplier-claim outcome",{exact:true}).selectOption("credit");await mixed.getByLabel("Supplier claim / credit / return reference",{exact:true}).fill("TEST-CREDIT-002");await mixed.getByLabel("Supplier-claim evidence and outcome",{exact:true}).fill("TEST owner checked supplier credit and signed returned sack");await mixed.getByRole("button",{name:"Save supplier-claim evidence",exact:true}).click();await expect(mixed).toContainText("Resolved supplier claim");
  await mixed.getByRole("button",{name:"View supplier-claim history",exact:true}).click();await expect(mixed).toContainText("TEST-CREDIT-002");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export loaded inspections (CSV)",exact:true}).click();const csv=await readFile((await(await download).path())!,"utf8");expect(csv).toContain("TEST-REJECTED-001");expect(csv).toContain("TEST-MIXED-002");
  const after=await countCommand<PurchasingWorkspace>(a.owner,"purchasing_workspace",a.ctx);expect(after.orders[0].lines[0].remaining).toBe("200");expect(after.orders[0].lines[0].held).toBe("0");
});
test("a server-confirmed fully rejected delivery recovers its original request without stock or duplicate receipts",async({page,browser})=>{
  const a=await fixture(),purchaseOrderId=randomUUID(),lineId=randomUUID();
  await countCommand(a.owner,"create_purchase_order",{...a.ctx,purchaseOrderId,supplierId:a.supplierId,reference:"TEST-PO-RECOVERY",reason:"TEST recovery request",items:[{lineId,productId:a.productId,unitId:a.unitId,quantity:"10"}]});
  await countCommand(a.owner,"purchase_order_event",{...a.ctx,purchaseOrderId,orderEventId:randomUUID(),expectedState:"pending",outcome:"approve",reason:"TEST owner approved recovery fixture"});
  await login(page,a);let lost=false;
  await page.route("**/rest/v1/rpc/agri_command",async route=>{if(route.request().postDataJSON().action==="inspect_delivery"&&!lost){const response=await route.fetch();expect(response.ok()).toBe(true);lost=true;await route.abort("failed");}else await route.continue();});
  await fillDelivery(page,purchaseOrderId,"TEST-REJECTED-RECOVERY");await page.getByRole("button",{name:"Save delivery inspection",exact:true}).click();await expect.poll(()=>lost).toBe(true);
  await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();await expect(page.getByRole("button",{name:"Retry original request",exact:true})).toBeVisible();
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export recovery file",exact:true}).click();const bytes=await readFile((await(await download).path())!);const archive=JSON.parse(bytes.toString());expect(archive.pendingOperations).toHaveLength(1);const receiptId=archive.pendingOperations[0].data.receiptId;
  const context=await browser.newContext();try{
    const restored=await context.newPage();await login(restored,a);await restored.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();const input=restored.getByLabel("Restore a recovery file",{exact:true});await expect(input).toBeEnabled();await input.setInputFiles({name:"TEST-rejected-delivery-recovery.json",mimeType:"application/json",buffer:bytes});
    await expect(restored.getByText("0 sale records checked and restored. Original transaction IDs and online requests are retained. Review the Sync center before retrying.",{exact:true})).toBeVisible();await restored.getByRole("button",{name:"Retry original request",exact:true}).click();await expect(restored.getByRole("button",{name:"Retry original request",exact:true})).toHaveCount(0);
  }finally{await context.close();}
  const records=await a.owner.from("purchase_receipts").select("id").eq("organization_id",a.organizationId);expect(records.error).toBeNull();expect(records.data).toEqual([{id:receiptId}]);
  const movements=await a.owner.from("inventory_movements").select("id").eq("source_id",receiptId);expect(movements.error).toBeNull();expect(movements.data).toHaveLength(0);
  const w=await countCommand<PurchasingWorkspace>(a.owner,"purchasing_workspace",a.ctx);expect(w.deliveries).toHaveLength(1);expect(w.orders[0].lines[0].remaining).toBe("500");
});
