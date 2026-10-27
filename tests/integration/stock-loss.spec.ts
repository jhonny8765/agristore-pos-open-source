import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { countCommand, testCountStaff } from "./blind-count-fixtures";
import type { CostHistoryRow, LossReport } from "../../apps/web/lib/stock-loss";
import Decimal from "decimal.js";

async function fixture() {
  if (process.env.AGRISTORE_LOCAL_INTEGRATION !== "1" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321") throw new Error("Disposable loopback purchase-cost fixtures only");
  const owner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `cost-${randomUUID()}@example.invalid`, password = `TEST-${randomUUID()}!`;
  const signup = await owner.auth.signUp({ email, password }); expect(signup.error).toBeNull();
  const { organizationId } = await countCommand<{ organizationId: string }>(owner, "bootstrap", { name: "TEST purchase-cost reporting", ownerName: "TEST cost owner" });
  const branches = await owner.from("branches").select("id").eq("organization_id", organizationId).order("code"); expect(branches.error).toBeNull();
  const branchId = branches.data![0].id as string, ctx = { organizationId, branchId };
  const { id: productId } = await countCommand<{ id: string }>(owner, "create_product", { ...ctx, name: "TEST quarter-kilo loss", sku: "TEST-COST", category: "Feeds", baseUnit: "kg", minimumStock: "0", units: [{ name: "Sack", factor: "50", price: 150000, cost: 120000 }, { name: "Kilo", factor: "1", price: 3500, cost: 2500 }] });
  const units = await owner.from("product_units").select("id,name").eq("product_id", productId); expect(units.error).toBeNull();
  const sackId = units.data!.find(u => u.name === "Sack")!.id as string;
  await countCommand(owner, "receive_stock", { ...ctx, receiptId: randomUUID(), source: "purchase", reference: "TEST ten sacks received", items: [{ productId, unitId: sackId, quantity: "10" }] });
  const issueId = randomUUID();
  await countCommand(owner, "record_stock_issue", { ...ctx, issueId, productId, batchId: null, quantity: "0.25", category: "unexplained", disposition: "write_off", reason: "TEST verified quarter-kilo shortage" });
  await countCommand(owner, "approve_stock_issue", { ...ctx, issueId, reason: "TEST owner verified physical shortage" });
  const report = await countCommand<LossReport>(owner, "stock_loss_report", ctx); expect(report.totals.missingLossCosts).toBe(1);
  return { owner, email, password, organizationId, branchId, ctx, productId, sackId, report, lossKey: report.rows[0].loss_key };
}
async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/"); await page.getByLabel("Email address", { exact: true }).fill(account.email); await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Stock loss at purchase cost", exact: true })).toBeVisible();
  await expect(page.getByText("Loading stock-loss report…", { exact: true })).toHaveCount(0);
}
async function fillCost(page: Page, sackId: string, correction = false, amount = "1250") {
  await page.getByRole("button", { name: correction ? "Record corrected purchase cost" : "Record purchase cost", exact: true }).click();
  await page.getByLabel("Purchase-cost unit", { exact: true }).selectOption(sackId);
  await page.getByLabel("Purchase cost per selected unit (₱)", { exact: true }).fill(amount);
  await page.getByLabel("Purchase-cost document reference", { exact: true }).fill("TEST invoice COST-001");
  await page.getByLabel("Purchase-cost explanation", { exact: true }).fill(correction ? "TEST corrected supplier invoice evidence" : "TEST documented cost for one 50 kg sack");
}
test("purchase-cost reporting values fractional losses, preserves corrections and supports manager read access", async ({ page, browser }) => {
  const a = await fixture(); await login(page, a);
  const rows = page.getByRole("region", { name: "Purchase-cost stock-loss rows", exact: true });
  await expect(rows).toContainText("Cost not documented"); await expect(rows).toContainText("0.25 kg");
  await fillCost(page, a.sackId);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".stock-loss-report").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/stock-loss-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Save cost evidence", exact: true }).click();
  await expect(rows).toContainText("₱6.25"); await expect(page.getByText("Documented-cost loss subtotal: ₱6.25", { exact: true })).toBeVisible();
  await fillCost(page, a.sackId, true, "1300"); await page.getByRole("button", { name: "Save cost evidence", exact: true }).click();
  await expect(rows).toContainText("₱6.50");
  await page.getByRole("button", { name: "View purchase-cost history", exact: true }).click();
  await expect(rows).toContainText("₱1,250.00 / Sack"); await expect(rows).toContainText("₱1,300.00 / Sack"); await expect(rows).toContainText("Version 2");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export loaded loss rows (CSV)", exact: true }).click();
  const csv = await readFile((await (await download).path())!, "utf8"); expect(csv).toContain('"0.250000"'); expect(csv).toContain('"650"'); expect(csv).toContain("TEST invoice COST-001");
  const stock = await a.owner.from("branch_inventory").select("quantity").eq("product_id", a.productId).eq("branch_id", a.branchId); expect(stock.error).toBeNull(); expect(Number(stock.data![0].quantity)).toBe(499.75);
  const manager = await testCountStaff(a, a.branchId, "TEST read-only cost manager");
  await countCommand(a.owner, "staff_access", { ...a.ctx, email: manager.email, name: "TEST read-only cost manager", role: "manager" });
  const context = await browser.newContext();
  try {
    const managerPage = await context.newPage(); await login(managerPage, manager);
    await expect(managerPage.getByRole("region", { name: "Purchase-cost stock-loss rows", exact: true })).toContainText("₱6.50");
    await expect(managerPage.getByRole("button", { name: "Record corrected purchase cost", exact: true })).toHaveCount(0);
    await expect(managerPage.getByLabel("Report all branches", { exact: true })).toHaveCount(0);
  } finally { await context.close(); }
  await page.getByLabel("Removal category", { exact: true }).selectOption("other_removal"); await page.getByRole("button", { name: "Apply loss-report filters", exact: true }).click();
  await expect(rows).toHaveCount(0); await expect(page.getByText("Documented-cost loss subtotal: ₱6.50", { exact: true })).toBeVisible();
});

test("a committed purchase-cost request with a lost response recovers once with its original ID", async ({ page, browser }) => {
  const a = await fixture(); await login(page, a); let lost = false;
  await page.route("**/rest/v1/rpc/agri_command", async route => {
    if (route.request().postDataJSON().action === "record_loss_cost" && !lost) { const response = await route.fetch(); expect(response.ok()).toBe(true); lost = true; await route.abort("failed"); }
    else await route.continue();
  });
  await fillCost(page, a.sackId); await page.getByRole("button", { name: "Save cost evidence", exact: true }).click(); await expect.poll(() => lost).toBe(true);
  await page.getByRole("button", { name: /^Sync center(?:\s+\d+)?$/ }).click();
  await expect(page.getByRole("button", { name: "Retry original request", exact: true })).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export recovery file", exact: true }).click();
  const bytes = await readFile((await (await download).path())!); const archive = JSON.parse(bytes.toString());
  expect(archive.pendingOperations).toHaveLength(1); const requestId = archive.pendingOperations[0].data.costEvidenceId;
  const context = await browser.newContext();
  try {
    const restored = await context.newPage(); await login(restored, a); await restored.getByRole("button", { name: /^Sync center(?:\s+\d+)?$/ }).click();
    const input = restored.getByLabel("Restore a recovery file", { exact: true }); await expect(input).toBeEnabled();
    await input.setInputFiles({ name: "TEST-cost-recovery.json", mimeType: "application/json", buffer: bytes });
    await expect(restored.getByText("0 sale records checked and restored. Original transaction IDs and online requests are retained. Review the Sync center before retrying.", { exact: true })).toBeVisible();
    await restored.getByRole("button", { name: "Retry original request", exact: true }).click();
    await expect(restored.getByRole("button", { name: "Retry original request", exact: true })).toHaveCount(0);
  } finally { await context.close(); }
  const history = await countCommand<{ rows: CostHistoryRow[] }>(a.owner, "loss_cost_history", { ...a.ctx, lossKey: a.lossKey }); expect(history.rows).toHaveLength(1); expect(history.rows[0].id).toBe(requestId);
  const events = await a.owner.from("audit_events").select("source_id").eq("organization_id", a.organizationId).eq("action", "record_loss_cost"); expect(events.error).toBeNull(); expect(events.data).toEqual([{ source_id: requestId }]);
  expect((await countCommand<LossReport>(a.owner, "stock_loss_report", a.ctx)).totals.documentedLossCentavos).toBe("625");
});

test("failed report filter changes cannot mix later pages or export values from another report", async ({page}) => {
 const a=await fixture();
 for(let n=0;n<55;n++){
  const issueId=randomUUID();await countCommand(a.owner,"record_stock_issue",{...a.ctx,issueId,productId:a.productId,batchId:null,quantity:n<50?"0.001":"0.002",category:n<50?"damage":"supplier_return",disposition:"write_off",reason:`TEST paged removal ${n}`});
  await countCommand(a.owner,"approve_stock_issue",{...a.ctx,issueId,reason:"TEST independently verified paged removal"});
 }
 let report=await countCommand<LossReport>(a.owner,"stock_loss_report",{...a.ctx,filter:"all"});const all=[...report.rows];while(report.next){report=await countCommand<LossReport>(a.owner,"stock_loss_report",{...a.ctx,filter:"all",asOf:report.asOf,cursor:report.next});all.push(...report.rows);}
 for(const row of all)await countCommand(a.owner,"record_loss_cost",{...a.ctx,lossKey:row.loss_key,costEvidenceId:randomUUID(),expectedCostId:null,unitId:a.sackId,unitCostCentavos:"125000",reference:"TEST page invoice",reason:"TEST documentary price per 50 kg sack",zeroCostConfirmed:false});
 await login(page,a);const region=page.getByRole("region",{name:"Purchase-cost stock-loss rows",exact:true});await expect(region.getByRole("row")).toHaveCount(51);await expect(page.getByText("Documented-cost loss subtotal: ₱7.75",{exact:true})).toBeVisible();
 let failed=false;const pages:Record<string,unknown>[]=[];
 await page.route("**/rest/v1/rpc/agri_command",async route=>{const r=route.request().postDataJSON();if(r.action==="stock_loss_report"&&r.data.filter==="other_removal"&&!failed){failed=true;await route.abort("failed");}else{if(r.action==="stock_loss_report"&&r.data.cursor)pages.push(r.data);await route.continue();}});
 await page.getByLabel("Removal category",{exact:true}).selectOption("other_removal");await page.getByRole("button",{name:"Apply loss-report filters",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Previously loaded report rows are retained");
 await page.getByRole("button",{name:"Load more loss rows",exact:true}).click();await expect(region.getByRole("row")).toHaveCount(52);expect(pages).toHaveLength(1);expect(pages[0].filter).toBe("loss");await expect(region).not.toContainText("supplier return");await expect(page.getByText("Documented-cost loss subtotal: ₱7.75",{exact:true})).toBeVisible();
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export loaded loss rows (CSV)",exact:true}).click();const csv=await readFile((await(await download).path())!,"utf8");expect(csv.split("\r\n")).toHaveLength(52);expect(csv).not.toContain('"other_removal"');for(const row of all.filter(r=>r.bucket==="loss"))expect(csv).toContain(`"${row.loss_key}"`);
 await page.getByRole("button",{name:"Apply loss-report filters",exact:true}).click();await expect(region.getByRole("row")).toHaveCount(6);await expect(region).toContainText("supplier return");await expect(page.getByText("Documented-cost loss subtotal: ₱7.75",{exact:true})).toBeVisible();await expect(page.getByLabel("Full-range loss valuation totals")).toContainText("Other authorised removals: ₱0.25");
 const stock=await a.owner.from("branch_inventory").select("quantity").eq("branch_id",a.branchId).eq("product_id",a.productId);expect(stock.error).toBeNull();expect(new Decimal(stock.data![0].quantity).eq("499.69")).toBe(true);
});

test("stock worklists load beyond fifty and approve or dispose the exact selected last record",async({page})=>{
 const a=await fixture();const pending:string[]=[];
 for(let n=0;n<51;n++){
  const issueId=randomUUID();await countCommand(a.owner,"record_stock_issue",{...a.ctx,issueId,productId:a.productId,batchId:null,quantity:"0.001",category:"damage",disposition:"hold",reason:`TEST held worklist ${n}`});await countCommand(a.owner,"approve_stock_issue",{...a.ctx,issueId,reason:"TEST owner checked held worklist goods"});
  const id=randomUUID();pending.push(id);await countCommand(a.owner,"record_stock_issue",{...a.ctx,issueId:id,productId:a.productId,batchId:null,quantity:"0.002",category:"damage",disposition:"write_off",reason:`TEST pending worklist ${n}`});
 }
 await login(page,a);await page.getByRole("button",{name:"Inventory",exact:true}).click();
 const held=page.getByRole("region",{name:"Held stock",exact:true}),issues=page.getByRole("region",{name:"Stock issues awaiting approval",exact:true});await expect(held.getByRole("row")).toHaveCount(51);await expect(issues.getByRole("row")).toHaveCount(51);
 await expect(page.getByText(/50 of 51 open held-goods records loaded/)).toBeVisible();await page.getByRole("button",{name:"Load more held goods",exact:true}).click();await expect(held.getByRole("row")).toHaveCount(52);await expect(issues.getByRole("row")).toHaveCount(51);await expect(page.getByRole("button",{name:"Load more held goods",exact:true})).toBeDisabled();
 let lost=false;await page.route("**/rest/v1/rpc/agri_command",async route=>{const r=route.request().postDataJSON();if(r.action==="stock_controls"&&r.data.issueCursor&&!lost){lost=true;await route.abort("failed");}else await route.continue();});
 await page.getByRole("button",{name:"Load more stock issues",exact:true}).click();await expect(page.getByRole("alert")).toBeVisible();await expect(held.getByRole("row")).toHaveCount(52);await expect(issues.getByRole("row")).toHaveCount(51);await page.getByRole("button",{name:"Load more stock issues",exact:true}).click();await expect(issues.getByRole("row")).toHaveCount(52);
 const last=issues.getByRole("row").filter({hasText:"TEST pending worklist 50"});await last.getByRole("button",{name:"Approve stock issue",exact:true}).click();await last.getByLabel("Approval notes",{exact:true}).fill("TEST owner checked the final pending quantity");await last.getByRole("button",{name:"Approve issue",exact:true}).click();await expect(last).toHaveCount(0);
 await page.getByRole("button",{name:"Load more held goods",exact:true}).click();const finalHold=held.getByRole("row").filter({hasText:"TEST held worklist 50"});await finalHold.getByRole("button",{name:"Record held-goods outcome",exact:true}).click();await finalHold.getByLabel("Quantity from held stock (base units)",{exact:true}).fill("0.001");await finalHold.getByLabel("Inspection / disposition reason",{exact:true}).fill("TEST physically disposed exactly the last held gram");await finalHold.getByRole("button",{name:"Record outcome",exact:true}).click();await expect(finalHold).toHaveCount(0);
 const report=await countCommand<LossReport>(a.owner,"stock_loss_report",a.ctx);expect(report.totals.lossRows).toBe(3);for(const row of report.rows)await countCommand(a.owner,"record_loss_cost",{...a.ctx,lossKey:row.loss_key,costEvidenceId:randomUUID(),expectedCostId:null,unitId:a.sackId,unitCostCentavos:"125000",zeroCostConfirmed:false,reference:"TEST worklist invoice",reason:"TEST price per actual 50 kg sack"});
 expect((await countCommand<LossReport>(a.owner,"stock_loss_report",a.ctx)).totals.documentedLossCentavos).toBe("633");const stocks=await a.owner.from("branch_inventory").select("quantity").eq("branch_id",a.branchId).eq("product_id",a.productId);expect(stocks.error).toBeNull();expect(new Decimal(stocks.data![0].quantity).eq("499.697")).toBe(true);
 const movements=await a.owner.from("inventory_movements").select("quantity").eq("branch_id",a.branchId).eq("product_id",a.productId);expect(movements.error).toBeNull();expect(movements.data!.reduce((sum,m)=>sum.plus(m.quantity),new Decimal(0)).eq("499.697")).toBe(true);expect(pending).toHaveLength(51);
});
