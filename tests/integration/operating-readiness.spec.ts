import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {countCommand} from "./blind-count-fixtures";

async function fixture(){
 if(process.env.AGRISTORE_LOCAL_INTEGRATION!=="1"||process.env.NEXT_PUBLIC_SUPABASE_URL!=="http://127.0.0.1:55321")throw new Error("Disposable loopback operating checks only");
 const owner=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),email=`operating-${randomUUID()}@example.invalid`,password=`TEST-${randomUUID()}!`;expect((await owner.auth.signUp({email,password})).error).toBeNull();
 const {organizationId}=await countCommand<{organizationId:string}>(owner,"bootstrap",{name:"TEST operating guide",ownerName:"TEST operating owner"});const branches=await owner.from("branches").select("id,name,code").eq("organization_id",organizationId).order("code");expect(branches.error).toBeNull();const branchId=branches.data![0].id as string,ctx={organizationId,branchId};
 const {id:productId}=await countCommand<{id:string}>(owner,"create_product",{...ctx,name:"TEST operating feeds",sku:"TEST-OPERATE",category:"Feeds",baseUnit:"kg",minimumStock:"0",units:[{name:"Kilo",factor:"1",price:100,cost:50}]});const units=await owner.from("product_units").select("id").eq("product_id",productId).single();expect(units.error).toBeNull();await countCommand(owner,"receive_stock",{...ctx,receiptId:randomUUID(),source:"purchase",reference:"TEST operating opening",items:[{productId,unitId:units.data!.id,quantity:"100"}]});
 return {owner,email,password,organizationId,branchId,productId,ctx,branches:branches.data!};
}
async function login(p:Page,a:{email:string;password:string}){await p.goto("/");await p.getByLabel("Email address",{exact:true}).fill(a.email);await p.getByLabel("Password",{exact:true}).fill(a.password);await p.getByRole("button",{name:"Sign in",exact:true}).click();await expect(p.getByRole("button",{name:"Add TEST operating feeds"})).toBeVisible();}

test("closed-shift offline reload retains the downloaded branch and receipts without inventing an empty queue",async({page,context})=>{
 const a=await fixture();await login(page,a);
 await page.getByRole("button",{name:"Open shift",exact:true}).click();
 await expect(page.getByRole("button",{name:"Add TEST operating feeds"})).toBeEnabled();
 await page.getByRole("button",{name:"Add TEST operating feeds"}).click();
 await page.getByLabel("Cash received",{exact:true}).fill("2");
 await page.getByRole("button",{name:"Complete cash sale",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Sale saved.",exact:true})).toBeVisible();
 await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();
 await expect(page.getByRole("heading",{name:"Your local queue is clear",exact:true})).toBeVisible();
 const queue=page.getByRole("region",{name:/Synchronization: Transaction, Amount/});
 await expect(queue).toContainText("synced");
 const saved=await a.owner.from("sales").select("id,receipt,total").eq("branch_id",a.branchId);expect(saved.error).toBeNull();expect(saved.data).toHaveLength(1);const original=saved.data![0];
 await page.getByRole("button",{name:"Settings",exact:true}).click();
 await page.getByLabel("Cash counted in drawer (₱)",{exact:true}).fill("1");
 await page.getByRole("button",{name:"Reconcile & close shift",exact:true}).click();
 await expect(page.getByText("No cashier shift is open. Open one from Checkout.",{exact:true})).toBeVisible();
 // Initial installation deliberately does not claim a running checkout tab.
 // Wait for the cache, then reopen online so the next navigation is controlled.
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await context.setOffline(true);await page.reload();
 const picker=page.getByRole("combobox",{name:"Current branch",exact:true});
 await expect(picker).toHaveValue(a.branchId);await expect(picker).toBeDisabled();
 await expect(page.getByRole("button",{name:"Open shift",exact:true})).toBeDisabled();
 await expect(page.locator(".workspace-footer")).toContainText(a.branches[0].code);
 await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();
 await expect(queue).toContainText(original.receipt);await expect(queue).toContainText("synced");
 await context.setOffline(false);await page.reload();
 await picker.selectOption(a.branches[1].id);
 await expect(page.getByText("Branch stock loaded.",{exact:true})).toBeVisible();
 await context.setOffline(true);await page.reload();
 await expect(picker).toHaveValue(a.branches[1].id);
 await expect(page.locator(".workspace-footer")).toContainText(a.branches[1].code);
 await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();
 await expect(page.getByRole("heading",{name:"No local transactions yet",exact:true})).toBeVisible();
 await expect(page.getByText(original.receipt,{exact:true})).toHaveCount(0);
 await context.setOffline(false);await page.reload();await expect(picker).toHaveValue(a.branches[1].id);
 await picker.selectOption(a.branchId);await expect(page.getByText("Branch stock loaded.",{exact:true})).toBeVisible();
 // A pre-upgrade cache lacks branch metadata. Retain it, but never guess which
 // stock/receipt scope it represents or show an empty-queue assurance.
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open("agristore-live-v1");open.onsuccess=()=>{const db=open.result,tx=db.transaction("settings","readwrite");tx.objectStore("settings").delete("snapshotScope");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);}));
 await context.setOffline(true);await page.reload();await expect(picker).toHaveValue("");
 await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();
 await expect(page.getByRole("heading",{name:"Reconnect to identify the saved branch",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Your local queue is clear",exact:true})).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"No local transactions yet",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Settings",exact:true}).click();const guide=page.getByRole("region",{name:"PC checks and store guide",exact:true});await expect(guide).toContainText("an empty view does not establish an empty queue");
 await context.setOffline(false);await page.reload();await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();await expect(queue).toContainText(original.receipt);
 const final=await a.owner.from("sales").select("id,total").eq("branch_id",a.branchId);expect(final.error).toBeNull();expect(final.data).toEqual([{id:original.id,total:100}]);
 const payments=await a.owner.from("payments").select("amount").eq("branch_id",a.branchId);expect(payments.error).toBeNull();expect(payments.data).toEqual([{amount:100}]);
 const stock=await a.owner.from("branch_inventory").select("quantity").eq("branch_id",a.branchId).single();expect(stock.error).toBeNull();expect(Number(stock.data!.quantity)).toBe(99);
 const shifts=await a.owner.from("cashier_shifts").select("expected_cash,counted_cash,closed_at").eq("branch_id",a.branchId).single();expect(shifts.error).toBeNull();expect(shifts.data).toMatchObject({expected_cash:100,counted_cash:100});expect(shifts.data!.closed_at).not.toBeNull();
});

test("operating checks and offline store instructions are readable without certifying untested launch gates",async({page,context})=>{
 const a=await fixture();await login(page,a);await page.getByRole("button",{name:"Settings",exact:true}).click();const guide=page.getByRole("region",{name:"PC checks and store guide",exact:true});await expect(guide).toContainText("No unconfirmed sales");await expect(guide).toContainText("No shift is saved");await expect(guide).toContainText("This screen cannot certify these steps");
 await guide.getByText("Internet fails, power goes off or Windows restarts",{exact:true}).click();await expect(guide.getByText(/Only the current authorized cashier can resume/)).toBeVisible();await guide.getByText("Receive a delivery, including partial or rejected goods",{exact:true}).click();await expect(guide.getByText(/Only accepted goods become saleable/)).toBeVisible();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include(".operating-guide").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze()).violations).toEqual([]);await page.screenshot({path:`test-results/operating-guide-${width}.png`,fullPage:true});}
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open("agristore-live-v1");open.onsuccess=()=>{const db=open.result,tx=db.transaction("settings","readwrite");tx.objectStore("settings").put({key:"snapshotAsOf",value:new Date(Date.now()-25*3600_000).toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);}));
 await guide.getByRole("button",{name:"Refresh PC checks",exact:true}).click();await expect(guide).toContainText("Older than 24 hours");await guide.getByRole("button",{name:"Refresh stock & catalog",exact:true}).click();await expect(guide).not.toContainText("Older than 24 hours");
 await context.setOffline(true);await expect(guide).toContainText("Offline: continue only");await guide.getByRole("button",{name:"Refresh PC checks",exact:true}).click();await expect(guide).toContainText("No unconfirmed sales");await guide.getByText("Storage is low, the PC is replaced or records need recovery",{exact:true}).click();await expect(guide.getByText(/Do not clear site data, uninstall/)).toBeVisible();await expect(guide.getByRole("button",{name:"Refresh stock & catalog",exact:true})).toBeDisabled();await context.setOffline(false);
 const sales=await a.owner.from("sales").select("id").eq("branch_id",a.branchId);expect(sales.error).toBeNull();expect(sales.data).toEqual([]);const stock=await a.owner.from("branch_inventory").select("quantity").eq("branch_id",a.branchId).single();expect(stock.error).toBeNull();expect(Number(stock.data!.quantity)).toBe(100);
});

test("mid-batch sign-in expiry pauses original sales and later verification keeps exact stock and cash",async({page,context})=>{
 const a=await fixture();await login(page,a);await page.getByRole("button",{name:"Open shift",exact:true}).click();await expect(page.getByRole("button",{name:"Add TEST operating feeds"})).toBeEnabled();await context.setOffline(true);
 for(let n=0;n<2;n++){await page.getByRole("button",{name:"Add TEST operating feeds"}).click();await page.getByLabel("Cash received",{exact:true}).fill("2");await page.getByRole("button",{name:"Complete cash sale",exact:true}).click();await expect(page.getByRole("heading",{name:"Sale saved.",exact:true})).toBeVisible();}
 let blocked=true,committed=false,refused=0;const attempts:string[]=[];
 await page.route("**/rest/v1/rpc/agri_command",async route=>{
  const body=route.request().postDataJSON();if(body.action==="record_sale"){attempts.push(body.data.transactionId);if(blocked&&committed){refused++;await route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({code:"PGRST303",message:"TEST token expired during upload batch"})});return;}const response=await route.fetch();expect(response.ok()).toBe(true);committed=true;await route.fulfill({response});}else await route.continue();
 });
 await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();await context.setOffline(false);await expect.poll(()=>refused).toBeGreaterThan(0);await expect(page.getByRole("region",{name:/Synchronization: Transaction, Amount/})).toContainText("authentication required");
 const first=await a.owner.from("sales").select("id").eq("branch_id",a.branchId);expect(first.error).toBeNull();expect(first.data).toHaveLength(1);
 await page.getByRole("button",{name:"Settings",exact:true}).click();const guide=page.getByRole("region",{name:"PC checks and store guide",exact:true});await guide.getByRole("button",{name:"Refresh PC checks",exact:true}).click();await expect(guide).toContainText("2 need sign-in");await expect(guide).toContainText("Action needed");
 blocked=false;await guide.getByRole("button",{name:"Open Sync center",exact:true}).click();await page.getByRole("button",{name:"Sync now",exact:true}).click();await expect(page.getByRole("heading",{name:"Your local queue is clear",exact:true})).toBeVisible();
 const final=await a.owner.from("sales").select("id,total").eq("branch_id",a.branchId);expect(final.error).toBeNull();expect(final.data).toHaveLength(2);expect(new Set(final.data!.map(s=>s.id)).size).toBe(2);expect([...new Set(attempts)].sort()).toEqual(final.data!.map(s=>s.id).sort());expect(final.data!.reduce((sum,s)=>sum+s.total,0)).toBe(200);
 const payments=await a.owner.from("payments").select("amount").eq("branch_id",a.branchId);expect(payments.error).toBeNull();expect(payments.data).toHaveLength(2);expect(payments.data!.reduce((sum,p)=>sum+p.amount,0)).toBe(200);const stock=await a.owner.from("branch_inventory").select("quantity").eq("branch_id",a.branchId).single();expect(stock.error).toBeNull();expect(Number(stock.data!.quantity)).toBe(98);const moves=await a.owner.from("inventory_movements").select("quantity").eq("branch_id",a.branchId);expect(moves.error).toBeNull();expect(moves.data!.reduce((sum,m)=>sum+Number(m.quantity),0)).toBe(98);await page.unrouteAll({behavior:"wait"});
});
