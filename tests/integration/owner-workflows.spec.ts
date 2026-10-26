import {sealedCount} from "./blind-count-fixtures";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { rows, salesPage } from "../../apps/web/lib/api";
import { historyPage } from "../../apps/web/lib/history-api";
import type { HistoryCursor, HistoryKind } from "../../apps/web/lib/history";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { Product } from "@agristore/domain";

const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (
  process.env.AGRISTORE_LOCAL_INTEGRATION !== "1" ||
  api !== "http://127.0.0.1:55321" ||
  !key
)
  throw new Error(
    "Owner workflow fixtures must use the disposable loopback database.",
  );

async function command<T = Record<string, unknown>>(
  owner: SupabaseClient,
  action: string,
  data: Record<string, unknown>,
): Promise<T> {
  const result = await owner.rpc("agri_command", { action, data });
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data as T;
}
async function business(
  productName = "Audit feeds",
  units = [{ name: "Kilo", factor: "1", price: 100, cost: 50 }],
) {
  const owner = createClient(api!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `audit-${randomUUID()}@example.com`;
  // Spaces are intentional: the UI must preserve a user's exact password.
  const password = ` Agri-${randomUUID()}! `;
  const signup = await owner.auth.signUp({ email, password });
  if (signup.error || !signup.data.session)
    throw new Error("Disposable owner signup failed.");
  const { organizationId } = await command<{ organizationId: string }>(
    owner,
    "bootstrap",
    { name: `TEST audit ${randomUUID()}`, ownerName: "Test audit owner" },
  );
  const branches = await owner
    .from("branches")
    .select("id,code")
    .eq("organization_id", organizationId)
    .order("code");
  expect(branches.error).toBeNull();
  const branchId = branches.data![0].id as string;
  const { id: productId } = await command<{ id: string }>(
    owner,
    "create_product",
    {
      organizationId,
      branchId,
      name: productName,
      sku: "AUDIT-FEED",
      category: "Feeds",
      baseUnit: "kg",
      minimumStock: "0",
      tracksExpiry: false,
      units,
    },
  );
  const unit = await owner
    .from("product_units")
    .select("id")
    .eq("product_id", productId)
    .eq("name", "Kilo")
    .single();
  expect(unit.error).toBeNull();
  await command(owner, "receive_stock", {
    organizationId,
    branchId,
    receiptId: randomUUID(),
    source: "purchase",
    reference: "TEST audit fixture stock",
    items: [
      {
        productId,
        unitId: unit.data!.id,
        quantity: "10000",
        lot: "",
        expiresOn: null,
      },
    ],
  });
  return {
    owner,
    email,
    password,
    organizationId,
    branchId,
    productId,
    unitId: unit.data!.id as string,
    branches: branches.data!,
  };
}
async function login(
  page: Page,
  account: Pick<Awaited<ReturnType<typeof business>>, "email" | "password">,
  productName = "Audit feeds",
) {
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Add ${productName}` }),
  ).toBeVisible();
}
async function closeShift(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Cash counted in drawer (₱)", { exact: true })
    .fill("0");
  await page
    .getByRole("button", { name: "Reconcile & close shift", exact: true })
    .click();
  await expect(
    page.getByText("No cashier shift is open. Open one from Checkout.", {
      exact: true,
    }),
  ).toBeVisible();
}

test("sign-out in a second window clears the first window and rejects its late private stock response",async({page,context})=>{
 const a=await business();await page.goto('/');await login(page,a);
 const other=await context.newPage();await other.goto('/');
 await expect(other.getByRole('button',{name:'Add Audit feeds'})).toBeVisible();
 let release!:()=>void,started!:()=>void;
 const held=new Promise<void>(yes=>{release=yes;});const captured=new Promise<void>(yes=>{started=yes;});
 let intercepted=false;
 await page.route('**/rest/v1/rpc/agri_command',async(route)=>{
  if(route.request().postDataJSON().action==='snapshot'&&!intercepted){
   intercepted=true;const response=await route.fetch();expect(response.ok()).toBe(true);started();await held;await route.fulfill({response});
  }else await route.continue();
 });
 try{
  await page.getByRole('button',{name:'Inventory',exact:true}).click();await captured;
  await other.getByTitle('Sign out',{exact:true}).click();
  await expect(other.getByLabel('Email address',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();
  release();
  await expect(page.getByRole('button',{name:'Add Audit feeds'})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>new Promise<number>((resolve,reject)=>{
   const open=indexedDB.open('agristore-live-v1');open.onsuccess=()=>{const d=open.result;const tx=d.transaction('products','readonly');const count=tx.objectStore('products').count();count.onsuccess=()=>resolve(count.result);tx.oncomplete=()=>d.close();tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);
  }))).toBe(0);
  await page.reload();await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();
 }finally{release();await other.close();}
});

test("confirmed deliveries and opening imports stay saved when the following stock refresh fails", async ({ page }) => {
  const a = await business();
  await page.goto("/");
  await login(page, a);
  await page.getByRole("button", { name: "Purchasing", exact: true }).click();
  await expect(page.getByLabel("Delivery / invoice reference", { exact: true })).toBeVisible();
  let blockSnapshots = false;
  const sent: string[] = [];
  await page.route("**/rest/v1/rpc/agri_command", async (route) => {
    const request = route.request().postDataJSON();
    if (request.action === "snapshot" && blockSnapshots) {
      await route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ code: "PGRST001", message: "TEST stock refresh unavailable" }) });
    } else if (request.action === "receive_stock") {
      sent.push(request.data.receiptId);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      blockSnapshots = true;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.getByLabel("Product and unit").selectOption(a.unitId, { timeout: 20_000 });
  await page.getByLabel("Delivery / invoice reference", { exact: true }).fill("TEST confirmed delivery");
  await page.getByLabel("Quantity received", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Receive stock", exact: true }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("Your action completed");
  await expect(page.locator(".notice[role=status]")).toContainText("Delivery recorded.");
  await expect(page.getByLabel("Delivery / invoice reference", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Quantity received", { exact: true })).toHaveValue("");
  // A second click now meets native required-field validation, not another write.
  await page.getByRole("button", { name: "Receive stock", exact: true }).click();
  expect(sent).toHaveLength(1);
  const receipts = await a.owner.from("purchase_receipts").select("id")
    .eq("organization_id", a.organizationId).eq("reference", "TEST confirmed delivery");
  expect(receipts.error).toBeNull();
  expect(receipts.data).toHaveLength(1);
  const stock = await a.owner.from("branch_inventory").select("quantity")
    .eq("branch_id", a.branchId).eq("product_id", a.productId).single();
  expect(stock.error).toBeNull();
  expect(Number(stock.data!.quantity)).toBe(10002);
  blockSnapshots = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".notice[role=alert]")).toHaveCount(0);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByRole("region",{name:/Product, Category$/}).getByRole("row").filter({ hasText: "Audit feeds" })).toContainText("10002 kg");

  const destination = a.branches[1].id as string;
  await page.getByRole("combobox", { name: "Current branch", exact: true }).selectOption(destination);
  await expect(page.getByText("Branch stock loaded.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Purchasing", exact: true }).click();
  await expect(page.getByLabel("Opening stock CSV",{exact:true})).toBeEnabled();
  await page.getByLabel("Opening stock CSV", { exact: true }).setInputFiles({
    name: "TEST-confirmed-opening.csv", mimeType: "text/csv",
    buffer: Buffer.from("sku,unit,quantity,lot,expiresOn\nAUDIT-FEED,Kilo,3,,\n"),
  });
  const opening = page.getByRole("form", { name: "Confirm opening stock", exact: true });
  await opening.getByRole("checkbox").check();
  await opening.getByRole("button", { name: "Confirm opening stock import", exact: true }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("Your action completed");
  await expect(opening).toHaveCount(0);
  const imported = await a.owner.from("purchase_receipts").select("id")
    .eq("organization_id", a.organizationId).eq("branch_id", destination).eq("source", "opening");
  expect(imported.error).toBeNull();
  expect(imported.data).toHaveLength(1);
  expect(sent).toHaveLength(2);
  blockSnapshots = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByRole("region",{name:/Product, Category$/}).getByRole("row").filter({ hasText: "Audit feeds" })).toContainText("3 kg");

  // The shared completion path must also let the product form reset after a
  // confirmed create, even though downloading the resulting catalog fails.
  const setup = page.getByRole("form", { name: "Add a product", exact: true });
  await setup.getByLabel("Product name", { exact: true }).fill("TEST confirmed packet");
  await setup.getByLabel("SKU / barcode", { exact: true }).fill("TEST-CONFIRMED-PACKET");
  await setup.getByLabel("How customers buy this product").selectOption("sealed");
  await setup.getByLabel("Price per Packet (₱)", { exact: true }).fill("60");
  await setup.getByLabel("Cost per Packet (₱)", { exact: true }).fill("40");
  blockSnapshots = true;
  await setup.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(setup.getByRole("status")).toContainText("TEST confirmed packet added");
  await expect(setup.getByLabel("Product name", { exact: true })).toHaveValue("");
  const created = await a.owner.from("products").select("id")
    .eq("organization_id", a.organizationId).eq("sku", "TEST-CONFIRMED-PACKET");
  expect(created.error).toBeNull();
  expect(created.data).toHaveLength(1);
  blockSnapshots = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const createdRow = page.getByRole("row").filter({ hasText: "TEST confirmed packet" });
  await expect(createdRow).toContainText("0 piece");
  await expect(createdRow).toContainText("Packet · ₱60.00");
});

test("transfers and count approvals identify separate lots, base quantities and exported batch IDs", async ({ page }) => {
  const a = await business();
  const { id: productId } = await command<{ id: string }>(a.owner, "create_product", {
    organizationId: a.organizationId, branchId: a.branchId,
    name: "TEST lot-tracked feeds", sku: "TEST-TWO-LOTS", category: "Feeds",
    baseUnit: "kg", minimumStock: "0", tracksExpiry: true,
    units: [{ name: "Sack", factor: "50", price: 150000, cost: 120000 },
      { name: "Kilo", factor: "1", price: 3500, cost: 2400 }],
  });
  const unit = await a.owner.from("product_units").select("id")
    .eq("product_id", productId).eq("name", "Kilo").single();
  expect(unit.error).toBeNull();
  const lots = [
    { lot: "TEST-LOT-A", expiresOn: "2028-06-30", quantity: "60", transfer: "0.5", counted: "0.4" },
    { lot: "TEST-LOT-B", expiresOn: "2029-09-30", quantity: "90", transfer: "0.25", counted: "0.2" },
  ];
  await command(a.owner, "receive_stock", {
    organizationId: a.organizationId, branchId: a.branchId, receiptId: randomUUID(),
    source: "purchase", reference: "TEST two-lot history fixture",
    items: lots.map((lot) => ({ ...lot, productId, unitId: unit.data!.id })),
  });
  const batches = await a.owner.from("product_batches").select("id,lot")
    .eq("product_id", productId);
  expect(batches.error).toBeNull();
  const destination = a.branches[1].id as string;
  await page.goto("/");
  await login(page, a);
  await page.getByRole("button", { name: "Transfers", exact: true }).click();
  for (const lot of lots) {
    const batchId = batches.data!.find((batch) => batch.lot === lot.lot)!.id;
    await page.getByLabel("Product / batch").selectOption(`${productId}:${batchId}`);
    await page.getByRole("combobox", { name: "Destination branch", exact: true }).selectOption(destination);
    await page.getByLabel("Quantity in base units (kg / liter / piece)", { exact: true }).fill(lot.transfer);
    await page.getByRole("button", { name: "Dispatch stock", exact: true }).click();
    const row = page.locator('.history-table[data-kind="transfers"] tbody tr').filter({ hasText: `Lot ${lot.lot}` });
    await expect(row).toContainText(`Expiry: ${lot.expiresOn}`);
    await expect(row.getByRole("cell").filter({hasText: new RegExp(`^${lot.transfer.replace('.', '\\.')} kgAccepted:`)})).toBeVisible();
  }
  async function exportedCsv() {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export loaded rows (CSV)", exact: true }).click();
    const download = await downloadPromise;
    return readFile((await download.path())!, "utf8");
  }
  const transferCsv = await exportedCsv();
  for (const lot of lots) {
    const batchId = batches.data!.find((batch) => batch.lot === lot.lot)!.id;
    expect(transferCsv).toContain(`"${batchId}","Lot ${lot.lot}","${lot.expiresOn}","kg"`);
  }
  await page.getByRole("combobox", { name: "Current branch", exact: true }).selectOption(destination);
  await expect(page.getByText("Branch stock loaded.", { exact: true })).toBeVisible();
  const transferA = page.locator('.history-table[data-kind="transfers"] tbody tr').filter({ hasText: "Lot TEST-LOT-A" });
  const transferB = page.locator('.history-table[data-kind="transfers"] tbody tr').filter({ hasText: "Lot TEST-LOT-B" });
  await transferA.getByRole("button", { name: "Confirm receipt", exact: true }).click();
  await transferA.getByLabel("Saleable quantity actually received (base units)").fill("0.5");
  await transferA.getByLabel("Receiving notes", {exact:true}).fill("TEST actual counted delivery");
  await transferA.getByRole("button", {name:"Record actual receipt",exact:true}).click();
  await expect(transferA.getByRole("cell", { name: "received", exact: true })).toBeVisible();
  await expect(transferB).toContainText("in transit");
  await transferB.getByRole("button", { name: "Confirm receipt", exact: true }).click();
  await transferB.getByLabel("Saleable quantity actually received (base units)").fill("0.25");
  await transferB.getByLabel("Receiving notes", {exact:true}).fill("TEST actual counted delivery");
  await transferB.getByRole("button", {name:"Record actual receipt",exact:true}).click();
  await expect(transferB.getByRole("cell", { name: "received", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stock counts", exact: true }).click();
  await page.getByRole("button", { name: "Review sealed counts", exact: true }).click();
  for (const lot of lots) {
    const batchId = batches.data!.find((batch) => batch.lot === lot.lot)!.id;
    await sealedCount(a,{organizationId:a.organizationId,branchId:destination,productId,batchId,countId:randomUUID(),counted:lot.counted,reason:`TEST simulated discrepancy for ${lot.lot}`});
    await page.getByRole("button",{name:"Refresh counts",exact:true}).click();
    const row = page.locator('.history-table[data-kind="counts"] tbody tr').filter({ hasText: `Lot ${lot.lot}` });
    await expect(row).toContainText(`Expiry: ${lot.expiresOn}`);
    await expect(row).toContainText(`Reason: TEST simulated discrepancy for ${lot.lot}`);
    await expect(row.getByRole("cell", { name: `${lot.transfer} kg`, exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: `${lot.counted} kg`, exact: true })).toBeVisible();
  }
  const countCsv = await exportedCsv();
  expect(countCsv).toContain('"Expected","Counted","Difference"');
  expect(countCsv).toContain('"-0.1"');
  expect(countCsv).toContain('"-0.05"');
  for (const lot of lots) expect(countCsv).toContain(`"Lot ${lot.lot}","${lot.expiresOn}","kg"`);
  const countA = page.locator('.history-table[data-kind="counts"] tbody tr').filter({ hasText: "Lot TEST-LOT-A" });
  const countB = page.locator('.history-table[data-kind="counts"] tbody tr').filter({ hasText: "Lot TEST-LOT-B" });
  await expect(countA.getByRole("cell", { name: "-0.1 kg", exact: true })).toBeVisible();
  await expect(countB.getByRole("cell", { name: "-0.05 kg", exact: true })).toBeVisible();
  for (const [width, height] of [[1440, 1000], [1280, 900], [428, 572], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).include('.history-register').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: `test-results/stock-history-${width}.png` });
  }
  const approvalA=page.locator(".count-record").filter({hasText:"Lot TEST-LOT-A"});
  await approvalA.getByRole("button", { name: "Approve adjustment", exact: true }).click();
  await approvalA.getByLabel("Approval evidence",{exact:true}).fill("TEST checked independently");
  await approvalA.getByRole("button",{name:"Confirm adjustment",exact:true}).click();
  await expect(countA.getByRole("cell", { name: "approved", exact: true })).toBeVisible();
  await expect(countB.getByRole("cell", { name: "pending", exact: true })).toBeVisible();
  const confirmed = await a.owner.from("branch_inventory").select("batch_id,quantity")
    .eq("branch_id", destination).eq("product_id", productId);
  expect(confirmed.error).toBeNull();
  for (const [index, lot] of lots.entries()) {
    const batchId = batches.data!.find((batch) => batch.lot === lot.lot)!.id;
    expect(Number(confirmed.data!.find((row) => row.batch_id === batchId)!.quantity))
      .toBe(Number(index === 0 ? lot.counted : lot.transfer));
  }
});

test("exact report quantities survive the real database, JSON, discrepancy display and CSV", async ({ page }) => {
  const a = await business();
  const source = a.branches[1].id as string;
  const destination = a.branches[2].id as string;
  const transferId = randomUUID(), countId = randomUUID();
  await command(a.owner, "receive_stock", {
    organizationId: a.organizationId, branchId: source, receiptId: randomUUID(),
    source: "purchase", reference: "TEST decimal boundary only",
    items: [{ productId: a.productId, unitId: a.unitId, quantity: "9999999999.000003", lot: "", expiresOn: null }],
  });
  await command(a.owner, "dispatch_transfer", {
    organizationId: a.organizationId, branchId: source, destinationBranchId: destination,
    productId: a.productId, batchId: null, quantity: "9999999999.000001", transferId,
  });
  const transfers = await historyPage({ kind: "transfers", organizationId: a.organizationId, branchId: source, range: { from: "", to: "" } }, a.owner);
  expect(transfers.rows.find((row) => row.id === transferId)!.quantity).toBe("9999999999.000001");
  await command(a.owner, "receive_transfer", { organizationId: a.organizationId, branchId: destination, transferId, receiptId:randomUUID(), quantity:"9999999999.000001", heldQuantity:"0", reason:"TEST actual receipt" });
  await sealedCount(a, {
    organizationId: a.organizationId, branchId: destination, countId,
    productId: a.productId, batchId: null, counted: "9999999999.000000",
    reason: "TEST numerical boundary; not a physical count",
  });
  const counts = await historyPage({ kind: "counts", organizationId: a.organizationId, branchId: destination, range: { from: "", to: "" } }, a.owner);
  expect(counts.rows.find((row) => row.id === countId)).toMatchObject({ expected: "9999999999.000001", counted: "9999999999.000000" });
  const movements = await rows("inventory_movements", a.organizationId, source, a.owner);
  expect(movements.find((row) => row.source_id === transferId)).toMatchObject({ quantity: "-9999999999.000001" });
  expect(movements.every((row) => typeof row.id === "string")).toBe(true);
  await page.goto("/");
  await login(page, a);
  await page.getByRole("combobox", { name: "Current branch", exact: true }).selectOption(destination);
  await expect(page.getByText("Branch stock loaded.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stock counts", exact: true }).click();
  await page.getByRole("button", { name: "Review sealed counts", exact: true }).click();
  await expect(page.getByRole("cell", { name: "9999999999.000001 kg", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "-0.000001 kg", exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export loaded rows (CSV)", exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"9999999999.000001","9999999999.000000","-0.000001"');
});

test("staff cannot bypass stock controls, escalate access or read unrelated branch history", async ({ page }) => {
  const a = await business();
  const otherBranch = a.branches[1].id as string;
  const thirdBranch = a.branches[2].id as string;
  await command(a.owner, "receive_stock", {
    organizationId: a.organizationId, branchId: otherBranch, receiptId: randomUUID(),
    source: "purchase", reference: "TEST branch isolation fixture",
    items: [{ productId: a.productId, unitId: a.unitId, quantity: "2", lot: "", expiresOn: null }],
  });
  await sealedCount(a, {
    organizationId: a.organizationId, branchId: otherBranch, countId: randomUUID(),
    productId: a.productId, batchId: null, counted: "2", reason: "TEST other-branch record",
  });
  const hiddenTransfer = randomUUID(), incomingTransfer = randomUUID();
  for (const [transferId, destinationBranchId] of [[hiddenTransfer, thirdBranch], [incomingTransfer, a.branchId]])
    await command(a.owner, "dispatch_transfer", {
      organizationId: a.organizationId, branchId: otherBranch, transferId,
      destinationBranchId, productId: a.productId, batchId: null, quantity: "0.25",
    });
  const staff: { owner: SupabaseClient; email: string; password: string }[] = [];
  for (const role of ["cashier", "manager", "stock_staff"] as const) {
    const user = createClient(api!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = `${role}-${randomUUID()}@example.com`, password = `Agri-${randomUUID()}!`;
    const signup = await user.auth.signUp({ email, password });
    expect(signup.error).toBeNull();
    expect(signup.data.session).not.toBeNull();
    const userId = signup.data.user!.id;
    await command(a.owner, "staff_access", { organizationId: a.organizationId, branchId: a.branchId, email, name: `TEST ${role}`, role });
    staff.push({ owner: user, email, password });
    // A successful own-branch command proves these denials are role checks,
    // rather than every request failing because the test session is invalid.
    const authorized = await user.rpc("agri_command", { action: "snapshot", data: { organizationId: a.organizationId, branchId: a.branchId, transactionIds: [] } });
    expect(authorized.error).toBeNull();
    expect(authorized.data.products.some((product: { id: string }) => product.id === a.productId)).toBe(true);
    const common = {
      organizationId: a.organizationId, branchId: a.branchId,
      productId: a.productId, unitId: a.unitId, batchId: null, transferId: incomingTransfer,
      destinationBranchId: otherBranch, receiptId: randomUUID(), countId: randomUUID(),
      quantity: "1", counted: "1", price: 1, cost: 1, reason: "TEST forbidden operation",
    };
    const prohibited = role === "cashier"
      ? ["receive_stock", "dispatch_transfer", "receive_transfer", "submit_count", "approve_count", "set_price", "staff_access"]
      : role === "manager" ? ["approve_count", "set_price", "staff_access"]
        : ["dispatch_transfer", "approve_count", "set_price", "staff_access", "refund_sale", "open_shift"];
    for (const action of prohibited) {
      const result = await user.rpc("agri_command", { action, data: common });
      expect(result.error?.code, `${role}: ${action}`).toBe("42501");
    }
    const crossBranch = await user.rpc("agri_command", { action: "snapshot", data: { organizationId: a.organizationId, branchId: otherBranch } });
    expect(crossBranch.error?.code).toBe("42501");
    const directEdit = await user.from("branch_inventory").update({ quantity: 0 }).eq("organization_id", a.organizationId);
    expect(directEdit.error?.code).toBe("42501");
    const escalation = await user.from("staff_memberships").update({ role: "owner", branch_id: null }).eq("user_id", userId);
    expect(escalation.error?.code).toBe("42501");
    for (const kind of ["purchases", "counts"] as const) {
      const history = await historyPage({ kind, organizationId: a.organizationId, branchId: otherBranch, range: { from: "", to: "" } }, user);
      expect(history.rows).toEqual([]);
    }
    const transfers = await historyPage({ kind: "transfers", organizationId: a.organizationId, branchId: a.branchId, range: { from: "", to: "" } }, user);
    expect(transfers.rows.map((row) => row.id)).toEqual([incomingTransfer]);
    const forbiddenRow = await user.from("stock_transfers").select("id").eq("id", hiddenTransfer);
    expect(forbiddenRow.error).toBeNull();
    expect(forbiddenRow.data).toEqual([]);
  }
  await page.goto("/");
  const cashier = staff[0];
  await login(page, cashier);
  await expect(page.getByRole("combobox", { name: "Current branch", exact: true }).locator("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Stock counts", exact: true }).click();
  await expect(page.getByText("Stock counts require a stock-staff, manager or owner account. Cashiers cannot submit or approve adjustments.",{exact:true})).toBeVisible();
  await page.getByRole("button", { name: "Transfers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dispatch stock", exact: true })).toBeDisabled();
  const incoming = page.locator('.history-table[data-kind="transfers"] tbody tr');
  await expect(incoming).toHaveCount(1);
  await expect(incoming).toContainText("0.25 kg");
  await expect(incoming.getByRole("button", { name: "Confirm receipt", exact: true })).toBeDisabled();
  // The server check above remains the authority even if UI controls are bypassed.
  const unchanged = await a.owner.from("stock_transfers").select("state").eq("id", incomingTransfer).single();
  expect(unchanged.error).toBeNull();
  expect(unchanged.data!.state).toBe("in_transit");
  await command(staff[2].owner, "receive_transfer", { organizationId: a.organizationId, branchId: a.branchId, transferId: incomingTransfer, receiptId:randomUUID(), quantity:"0.25", heldQuantity:"0", reason:"TEST actual receipt" });
  const received = await a.owner.from("stock_transfers").select("state").eq("id", incomingTransfer).single();
  expect(received.error).toBeNull();
  expect(received.data!.state).toBe("received");
});

test("a failed account verification never becomes an empty new-business result", async ({
  page,
}) => {
  const a = await business();
  await page.goto("/");
  await login(page, a);
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "bad_jwt",
        msg: "TEST interrupted account verification",
      }),
    }),
  );
  await page.reload();
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "Could not verify your store access",
  );
  await expect(
    page.getByRole("button", { name: "Create business", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/auth/v1/user");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add Audit feeds" }),
  ).toBeVisible();
  await expect(page.locator(".notice[role=alert]")).toHaveCount(0);
});

test("owner product setup creates only enabled selling units with independent retail prices", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const a = await business();
  await page.goto("/");
  await login(page, a);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const form = page.getByRole("form", { name: "Add a product", exact: true });
  await form
    .getByLabel("Product name", { exact: true })
    .fill("TEST 25 kg feeds");
  await form.getByLabel("SKU / barcode", { exact: true }).fill("TEST-SETUP-25");
  await form.getByLabel("How customers buy this product").selectOption("sack");
  await expect(form.getByLabel("Also sell loose kilos")).not.toBeChecked();
  await expect(
    form.getByLabel("Price per kilo (₱)", { exact: true }),
  ).toHaveCount(0);
  await form.getByLabel("Number of kg in one Sack").fill("25");
  await form.getByLabel("Price per Sack (₱)", { exact: true }).fill("900");
  await form.getByLabel("Cost per Sack (₱)", { exact: true }).fill("700");
  await form.getByLabel("Also sell loose kilos").check();
  await form.getByLabel("Price per kilo (₱)", { exact: true }).fill("45");
  await form.getByLabel("Cost per kilo (₱)", { exact: true }).fill("28");
  await expect(form.locator(".setup-summary")).toContainText("1 Sack = 25 kg");
  for (const width of [1440, 390, 418, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .include(".product-setup")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await form.screenshot({ path: `test-results/product-setup-${width}.png` });
  }
  await form.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(form.getByRole("status")).toContainText(
    "TEST 25 kg feeds added",
  );
  await expect(form.getByLabel("Product name", { exact: true })).toHaveValue(
    "",
  );
  await form
    .getByLabel("Product name", { exact: true })
    .fill("TEST sealed nutrients");
  await form.getByLabel("SKU / barcode", { exact: true }).fill("TEST-SEALED");
  await form
    .getByLabel("How customers buy this product")
    .selectOption("sealed");
  await expect(form.getByLabel("Also sell loose kilos")).toHaveCount(0);
  await form.getByLabel("Price per Packet (₱)", { exact: true }).fill("60");
  await form.getByLabel("Cost per Packet (₱)", { exact: true }).fill("40");
  await form.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(form.getByRole("status")).toContainText(
    "TEST sealed nutrients added",
  );
  const snapshot = await command<{ products: Product[] }>(a.owner, "snapshot", {
    organizationId: a.organizationId,
    branchId: a.branchId,
    transactionIds: [],
  });
  const feed = snapshot.products.find(
    (product) => product.sku === "TEST-SETUP-25",
  )!;
  expect(feed.baseUnit).toBe("kg");
  expect(
    feed.units.map(({ name, factor, price, cost }) => ({
      name,
      factor,
      price,
      cost,
    })),
  ).toEqual(
    expect.arrayContaining([
      { name: "Sack", factor: "25.000000", price: 90000, cost: 70000 },
      { name: "Kilo", factor: "1.000000", price: 4500, cost: 2800 },
    ]),
  );
  expect(feed.units).toHaveLength(2);
  const packet = snapshot.products.find(
    (product) => product.sku === "TEST-SEALED",
  )!;
  expect(packet.baseUnit).toBe("piece");
  expect(packet.units).toHaveLength(1);
  expect(Number(packet.units[0].factor)).toBe(1);
  // A server-side duplicate refusal leaves the completed form recoverable.
  await form
    .getByLabel("Product name", { exact: true })
    .fill("TEST duplicate SKU");
  await form.getByLabel("SKU / barcode", { exact: true }).fill("TEST-SEALED");
  await form.getByLabel("Price per Packet (₱)", { exact: true }).fill("60");
  await form.getByLabel("Cost per Packet (₱)", { exact: true }).fill("40");
  await form.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText(
    "This SKU already exists",
  );
  await expect(form.getByLabel("Product name", { exact: true })).toHaveValue(
    "TEST duplicate SKU",
  );
  await page.getByRole("button", { name: "Checkout POS", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Sell TEST 25 kg feeds by weight",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Sell TEST sealed nutrients by weight",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("offline mixed sacks, quarters, halves and peso-weight sales synchronize exact stock and retail prices", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const name = "TEST measured feeds";
  const a = await business(name, [
    { name: "Sack (50 kg)", factor: "50", price: 158000, cost: 138000 },
    { name: "Kilo", factor: "1", price: 3500, cost: 2760 },
  ]);
  await page.goto("/");
  await login(page, a, name);
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  const add = page.getByRole("button", { name: `Add ${name}` });
  await expect(add).toBeEnabled();
  await context.setOffline(true);
  await add.click();
  await page
    .getByLabel(`Unit for ${name}`)
    .selectOption({ label: "Sack (50 kg)" });
  await add.click();
  await page.getByRole("button", { name: "¼ kg", exact: true }).nth(1).click();
  await add.click();
  await page.getByRole("button", { name: "½ kg", exact: true }).nth(2).click();
  await add.click();
  await page
    .getByRole("button", { name: "By peso amount", exact: true })
    .nth(3)
    .click();
  await page.getByLabel(`Customer budget (₱) for ${name}`).fill("50");
  await page
    .getByRole("button", { name: "Estimate weight", exact: true })
    .click();
  await expect(
    page.getByLabel(new RegExp(`^Quantity [(].+[)] for ${name}$`)).nth(3),
  ).toHaveValue("1.428");
  await expect(
    page.getByRole("button", { name: "Complete cash sale" }),
  ).toBeDisabled();
  await page.getByLabel(`Weight entry for ${name}`).nth(2).selectOption("g");
  await page
    .getByLabel(new RegExp(`^Quantity [(].+[)] for ${name}$`))
    .nth(3)
    .fill("1430");
  await page
    .getByRole("button", { name: "Confirm weighed amount", exact: true })
    .click();
  await page.getByLabel("Cash received", { exact: true }).fill("2000");
  await page
    .getByRole("button", { name: "Complete cash sale", exact: true })
    .click();
  await expect(page.getByText("₱343.70 change", { exact: true })).toBeVisible();
  // The success icon must not constrain the printable item list to 53px.
  const printed = page.locator(".receipt-print-details");
  await expect(printed).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(printed).toBeVisible();
  await expect(printed).toContainText("0.25 Kilo");
  await expect(printed).toContainText("0.5 Kilo");
  await expect(printed).toContainText("1.43 Kilo");
  const printLayout = await printed.evaluate((el) => {
    const details = el.getBoundingClientRect();
    const last = el.lastElementChild!.getBoundingClientRect();
    const footer = el.nextElementSibling!.getBoundingClientRect();
    return {
      width: details.width,
      fits: el.scrollWidth <= el.clientWidth,
      containsLines: last.bottom <= details.bottom,
      footerAfter: footer.top >= details.bottom,
    };
  });
  expect(printLayout.width).toBeGreaterThan(180);
  expect(printLayout.fits).toBe(true);
  expect(printLayout.containsLines).toBe(true);
  expect(printLayout.footerAfter).toBe(true);
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByRole("article").filter({ has: add })).toContainText(
    "9947.82 kg on hand",
  );
  const before = await a.owner
    .from("sales")
    .select("id")
    .eq("organization_id", a.organizationId);
  expect(before.error).toBeNull();
  expect(before.data).toEqual([]);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync center", exact: false }).click();
  await expect(page.locator(".status-tag")).toContainText("synced", {
    timeout: 60_000,
  });
  const saved = await a.owner
    .from("sales")
    .select("id,total,payload")
    .eq("organization_id", a.organizationId)
    .single();
  expect(saved.error).toBeNull();
  expect(Number(saved.data!.total)).toBe(165630);
  const items = saved.data!.payload.items;
  expect(items.map((item: { quantity: string }) => item.quantity)).toEqual([
    "1",
    "0.25",
    "0.5",
    "1.43",
  ]);
  expect(items.map((item: { unitPrice: number }) => item.unitPrice)).toEqual([
    158000, 3500, 3500, 3500,
  ]);
  const movements = await a.owner
    .from("inventory_movements")
    .select("quantity")
    .eq("source_id", saved.data!.id)
    .eq("kind", "sale");
  expect(movements.error).toBeNull();
  expect(
    movements.data!.map((row) => Number(row.quantity)).sort((x, y) => x - y),
  ).toEqual([-50, -1.43, -0.5, -0.25]);
  const stock = await a.owner
    .from("branch_inventory")
    .select("quantity")
    .eq("branch_id", a.branchId)
    .eq("product_id", a.productId)
    .single();
  expect(stock.error).toBeNull();
  expect(Number(stock.data!.quantity)).toBe(9947.82);
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await expect(page.getByRole("article").filter({ has: add })).toContainText(
    "9947.82 kg on hand",
  );
  const retry = await command<{ status: string }>(
    a.owner,
    "record_sale",
    saved.data!.payload,
  );
  expect(retry.status).toBe("duplicate");
  const after = await a.owner
    .from("inventory_movements")
    .select("id")
    .eq("source_id", saved.data!.id)
    .eq("kind", "sale");
  expect(after.error).toBeNull();
  expect(after.data).toHaveLength(4);
});

test("owner accessibility covers keyboard navigation, narrow reflow and forced colors", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const a = await business();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const failures: {
    screen: string;
    mode: string;
    rule: string;
    targets: unknown[];
  }[] = [];
  async function scan(screen: string, mode: string) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    for (const violation of result.violations)
      failures.push({
        screen,
        mode,
        rule: violation.id,
        targets: violation.nodes.map((n) => n.target),
      });
  }
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await scan("Sign in", "desktop");
  await login(page, a);
  const skip = page.getByRole("link", {
    name: "Skip to main content",
    exact: true,
  });
  await skip.focus();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await skip.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", {
      name: "Better Yield Point of Sale home",
      exact: true,
    }),
  ).toBeFocused();
  function contrast(first: string, second: string) {
    const luminance = (color: string) =>
      (color.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const left = luminance(first),
      right = luminance(second);
    return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
  }
  const ring = await page
    .getByRole("link", { name: "Better Yield Point of Sale home", exact: true })
    .evaluate((el) => ({
      ring: getComputedStyle(el).outlineColor,
      background: getComputedStyle(el.closest(".sidebar")!).backgroundColor,
    }));
  expect(contrast(ring.ring, ring.background)).toBeGreaterThanOrEqual(3);
  const input = await page
    .getByLabel("Opening cash (₱)", { exact: true })
    .evaluate((el) => ({
      border: getComputedStyle(el).borderColor,
      background: getComputedStyle(el).backgroundColor,
    }));
  expect(contrast(input.border, input.background)).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  const addProduct = page.getByRole("button", {
    name: "Add Audit feeds",
  });
  const productTile = page.locator(".product").filter({ has: addProduct });
  await expect(addProduct).toBeEnabled();
  // Explicit selling controls must stay separate; metadata does not trigger
  // the default pack action. The named Add control remains keyboard operable.
  await addProduct.press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove Audit feeds", exact: true }),
  ).toBeVisible();
  await addProduct.focus();
  await expect(productTile).toHaveCSS("outline-style", "solid");
  await scan("Checkout with active cart", "desktop");
  for (const name of [
    "Remove Audit feeds",
    "Decrease Audit feeds",
    "Increase Audit feeds",
  ]) {
    const size = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(24);
    expect(size!.height).toBeGreaterThanOrEqual(24);
  }
  await page
    .getByRole("button", { name: "Remove Audit feeds", exact: true })
    .click();
  await page.getByRole("button", { name: "Feeds", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Feeds", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All products", exact: true }).click();
  await closeShift(page);
  const screens = [
    "Checkout",
    "Overview",
    "Inventory",
    "Purchasing",
    "Transfers",
    "Stock counts",
    "Sales & receipts",
    "Sync center",
    "Settings",
  ];
  for (const screen of screens) {
    const navigationName = screen === "Checkout" ? "Checkout POS" : screen;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: navigationName, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: navigationName, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#main h1")).toBeFocused();
    if (screen === "Stock counts")
      await page.getByRole("button", {name:"Review sealed counts",exact:true}).click();
    if (
      ["Overview", "Purchasing", "Transfers", "Stock counts"].includes(screen)
    )
      await expect(page.locator(".history-register")).toContainText(/loaded ·/);
    if (screen === "Settings")
      await expect(
        page.getByRole("cell", { name: "Test audit owner", exact: true }),
      ).toBeVisible();
    await scan(screen, "desktop");
    const unnamed = await page
      .locator(".table-wrap")
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (el) =>
              el.getAttribute("role") !== "region" ||
              !el.getAttribute("aria-label") ||
              (el as HTMLElement).tabIndex !== 0,
          ).length,
      );
    expect(unnamed).toBe(0);
    for (const width of [640, 320]) {
      // 640 CSS pixels exercises the reflow width of 1280px at 200% page zoom.
      // This does not claim the in-app browser's zoom shortcut changed its scale.
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${screen} at ${width}px`,
      ).toBe(true);
      if (width === 320) await scan(screen, "320px reflow");
    }
    await page.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await expect(
      page.getByRole("button", { name: navigationName, exact: true }),
    ).toHaveCSS("border-top-style", "solid");
    await expect(
      page.getByRole("button", { name: navigationName, exact: true }),
    ).toHaveCSS("border-top-width", "2px");
    expect(
      await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.emulateMedia({
      forcedColors: "none",
      reducedMotion: "no-preference",
    });
  }
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});

test("owner approvals work without browser dialogs, stock refreshes without a shift, and another account cannot see cached data", async ({
  page,
}) => {
  const a = await business();
  await page.goto("/");
  await login(page, a);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Audit feeds" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Add Audit feeds" }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Complete cash sale", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sale saved.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Sync center/ }).click();
  await expect(
    page.locator(".status-tag").filter({ hasText: /^synced$/ }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sales & receipts", exact: true })
    .click();
  await page.getByRole("button", { name: "Full refund", exact: true }).click();
  const refund = page.getByRole("form", { name: "Full refund", exact: true });
  await refund.getByLabel("Returned quantity for line 1",{exact:false}).fill("1");
  await refund.getByLabel("Disposition for return line 1").selectOption("resalable");
  await refund.getByLabel("Refund reason", { exact: true }).fill("   ");
  await refund
    .getByRole("button", { name: "Confirm full refund", exact: true })
    .click();
  await expect(refund.getByRole("alert")).toContainText(
    "at least 3 characters",
  );
  await expect(refund.getByLabel("Refund reason", { exact: true })).toHaveValue(
    "   ",
  );
  for (const width of [390, 418]) {
    await page.setViewportSize({ width, height: 844 });
    await refund.getByLabel("Refund reason", { exact: true }).focus();
    const fits = await refund.evaluate((form) => {
      const field = form.querySelector("input")!.getBoundingClientRect();
      const area = form.closest(".table-wrap")!.getBoundingClientRect();
      return field.left - 6 >= area.left && field.right + 6 <= area.right;
    });
    expect(fits).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await refund
    .getByLabel("Refund reason", { exact: true })
    .fill("TEST return and restore stock");
  await refund
    .getByRole("button", { name: "Confirm full refund", exact: true })
    .click();
  await expect(page.getByText("Refunded", { exact: true })).toBeVisible();
  await closeShift(page);

  const firstPC = await a.owner
    .from("devices")
    .select("id")
    .eq("organization_id", a.organizationId)
    .eq("active", true)
    .single();
  expect(firstPC.error).toBeNull();
  await page.getByRole("button", { name: "Retire PC", exact: true }).click();
  await page
    .getByLabel("PC retirement reason", { exact: true })
    .fill("TEST replace this registered browser");
  await page
    .getByRole("button", { name: "Confirm PC retirement", exact: true })
    .click();
  await expect(page.getByText("Retired", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Audit feeds" }),
  ).toBeEnabled();
  const nextPC = await a.owner
    .from("devices")
    .select("id")
    .eq("organization_id", a.organizationId)
    .eq("active", true)
    .single();
  expect(nextPC.error).toBeNull();
  expect(nextPC.data!.id).not.toBe(firstPC.data!.id);
  // A remote retirement (or an older app) can leave this browser holding a
  // retired identity. Recovery must preserve its saved receipts and its cart.
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByRole("button", { name: "Add Audit feeds" }).click();
  await command(a.owner, "retire_device", {
    organizationId: a.organizationId,
    branchId: a.branchId,
    deviceId: nextPC.data!.id,
    reason: "TEST remote retirement with retained browser setup",
    countedCash: 0,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const retiredRows = page.locator("tr").filter({
    has: page.getByRole("button", {
      name: "Release retired setup",
      exact: true,
    }),
  });
  await expect(retiredRows).toHaveCount(2);
  await expect(
    retiredRows
      .last()
      .getByRole("button", { name: "Release retired setup", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await expect(page.getByLabel(/^Quantity \(.+\) for Audit feeds$/)).toHaveValue("1");
  await page
    .getByRole("button", { name: "Remove Audit feeds", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .locator(`tr[data-device-id="${firstPC.data!.id}"]`)
    .getByRole("button", { name: "Release retired setup", exact: true })
    .click();
  await expect(
    page.getByText(
      "This retired registration belongs to a different browser. Use the browser registered to it.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .locator(`tr[data-device-id="${nextPC.data!.id}"]`)
    .getByRole("button", { name: "Release retired setup", exact: true })
    .click();
  await expect(
    page.getByText(
      "Retired setup released on this browser. Saved sales are retained. Open a shift to register its replacement.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Audit feeds" }),
  ).toBeEnabled();
  const replacement = await a.owner
    .from("devices")
    .select("id")
    .eq("organization_id", a.organizationId)
    .eq("active", true)
    .single();
  expect(replacement.error).toBeNull();
  expect(replacement.data!.id).not.toBe(nextPC.data!.id);
  await page.getByRole("button", { name: /Sync center/ }).click();
  await expect(
    page.locator(".status-tag").filter({ hasText: /^synced$/ }),
  ).toHaveCount(1);

  await closeShift(page);

  await page
    .getByRole("combobox", { name: "Current branch", exact: true })
    .selectOption(a.branches[1].id);
  await page.getByRole("button", { name: "Purchasing", exact: true }).click();
  await expect(page.getByLabel("Opening stock CSV",{exact:true})).toBeEnabled();
  await page.getByLabel("Opening stock CSV", { exact: true }).setInputFiles({
    name: "test-opening.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "sku,unit,quantity,lot,expiresOn\nAUDIT-FEED,Kilo,20,,\n",
    ),
  });
  const opening = page.getByRole("form", {
    name: "Confirm opening stock",
    exact: true,
  });
  await expect(opening).toContainText("1 opening-stock lines");
  await opening.getByRole("checkbox").check();
  await opening
    .getByRole("button", { name: "Confirm opening stock import", exact: true })
    .click();
  await expect(opening).not.toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("region",{name:/Product, Category$/}).getByRole("row").filter({ hasText: "Audit feeds" }),
  ).toContainText("20 kg");
  await page.getByRole("button", { name: "Stock counts", exact: true }).click();
  await page.getByRole("button", { name: "Review sealed counts", exact: true }).click();
  await sealedCount(a,{organizationId:a.organizationId,branchId:a.branches[1].id,productId:a.productId,batchId:null,countId:randomUUID(),counted:"19",reason:"TEST verify approved discrepancy"});
  await page.getByRole("button",{name:"Refresh counts",exact:true}).click();
  try {
    await expect(page.getByRole("button",{name:"Approve adjustment",exact:true})).toBeVisible();
  } catch (failure) {
    // Only disposable fixture evidence is logged; never sessions, credentials or a browser trace.
    console.error("TEST missing approval diagnostics", JSON.stringify({
      workspace: await command(a.owner,"count_workspace",{organizationId:a.organizationId,branchId:a.branches[1].id}),
      screen: await page.getByRole("region",{name:"Blind stock counts",exact:true}).innerText(),
    }));
    throw failure;
  }
  await page.getByRole("button",{name:"Approve adjustment",exact:true}).click();
  await page.getByLabel("Approval evidence",{exact:true}).fill("TEST checked independently");
  await page.getByRole("button",{name:"Confirm adjustment",exact:true}).click();
  await expect(page.getByRole("cell", { name: "approved", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("region",{name:/Product, Category$/}).getByRole("row").filter({ hasText: "Audit feeds" }),
  ).toContainText("19 kg");
  await page.getByRole("button", { name: "Transfers", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Destination branch", exact: true })
    .selectOption(a.branchId);
  await page
    .getByLabel("Quantity in base units (kg / liter / piece)", { exact: true })
    .fill("1");
  await page
    .getByRole("button", { name: "Dispatch stock", exact: true })
    .click();
  await expect(page.getByLabel("Quantity in base units (kg / liter / piece)", { exact: true })).toHaveValue("");
  await expect(page.getByText("in transit", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Current branch", exact: true })
    .selectOption(a.branchId);
  await page
    .getByRole("button", { name: "Confirm receipt", exact: true })
    .click();
  await page.getByLabel("Saleable quantity actually received (base units)").fill("1");
  await page.getByLabel("Receiving notes",{exact:true}).fill("TEST counted actual delivery");
  await page.getByRole("button",{name:"Record actual receipt",exact:true}).click();
  await expect(page.getByText("received", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("region",{name:/Product, Category$/}).getByRole("row").filter({ hasText: "Audit feeds" }),
  ).toContainText("10001 kg");

  const b = await business("Other business product");
  await page.getByTitle("Sign out", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await login(page, b, "Other business product");
  await expect(
    page.getByRole("button", { name: "Add Audit feeds" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Transfers", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No transfers yet", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("branch history pages beyond 1000, filters Manila days, recovers a failed page and exports only loaded rows", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const a = await business();
  const expected = new Set<string>();
  for (let start = 0; start < 1005; start += 25) {
    await Promise.all(
      Array.from({ length: Math.min(25, 1005 - start) }, async (_, index) => {
        const receiptId = randomUUID();
        expected.add(receiptId);
        await command(a.owner, "receive_stock", {
          organizationId: a.organizationId,
          branchId: a.branchId,
          receiptId,
          source: "purchase",
          reference: `TEST history ${start + index}`,
          items: [
            {
              productId: a.productId,
              unitId: a.unitId,
              quantity: "1",
              lot: "",
              expiresOn: null,
            },
          ],
        });
      }),
    );
  }
  const destination = a.branches[1].id as string;
  for (let i = 0; i < 55; i++) {
    await command(a.owner, "dispatch_transfer", {
      organizationId: a.organizationId,
      branchId: a.branchId,
      destinationBranchId: destination,
      transferId: randomUUID(),
      productId: a.productId,
      batchId: null,
      quantity: "1",
    });
    await sealedCount(a, {
      organizationId: a.organizationId,
      branchId: a.branchId,
      countId: randomUUID(),
      productId: a.productId,
      batchId: null,
      counted: "10000",
      reason: "TEST report history fixture",
    });
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const range = { from: today, to: today };
  async function collect(kind: HistoryKind, branchId = a.branchId) {
    const ids = new Set<string>();
    let before: HistoryCursor | undefined;
    do {
      const result = await historyPage(
        { kind, organizationId: a.organizationId, branchId, range, before },
        a.owner,
      );
      for (const row of result.rows) {
        expect(ids.has(String(row.id))).toBe(false);
        ids.add(String(row.id));
      }
      before = result.next;
    } while (before);
    return ids;
  }
  // The initial business fixture contributes one additional receiving record.
  const receipts = await collect("purchases");
  expect(receipts.size).toBe(1006);
  for (const id of expected) expect(receipts.has(id)).toBe(true);
  expect((await collect("transfers")).size).toBe(55);
  expect((await collect("transfers", destination)).size).toBe(55);
  expect((await collect("counts")).size).toBe(55);
  expect((await collect("audit")).size).toBeGreaterThan(1000);
  for (const kind of ["purchases", "transfers", "counts"] as const)
    expect((await collect(kind, a.branches[2].id as string)).size).toBe(0);
  expect(
    (
      await historyPage(
        {
          kind: "purchases",
          organizationId: a.organizationId,
          branchId: a.branchId,
          range: { from: "2099-01-01", to: "2099-01-01" },
        },
        a.owner,
      )
    ).rows,
  ).toEqual([]);
  const b = await business("Other business product");
  expect(
    (
      await historyPage(
        {
          kind: "purchases",
          organizationId: a.organizationId,
          branchId: a.branchId,
          range,
        },
        b.owner,
      )
    ).rows,
  ).toEqual([]);

  await page.goto("/");
  await login(page, a);
  await page.getByRole("button", { name: "Purchasing", exact: true }).click();
  const register = page.getByRole("region", {
    name: "Receiving history",
    exact: true,
  });
  await expect(register.locator("tbody tr")).toHaveCount(50);
  let failPage = true;
  await page.route("**/rest/v1/purchase_receipts?*", async (route) => {
    if (failPage) {
      await route.abort("failed");
    } else await route.continue();
  });
  await register
    .getByRole("button", { name: "Load older records", exact: true })
    .click();
  await expect(register.getByRole("alert")).toBeVisible();
  await expect(register.locator("tbody tr")).toHaveCount(50);
  failPage = false;
  await register
    .getByRole("button", { name: "Retry history", exact: true })
    .click();
  await expect(register.locator("tbody tr")).toHaveCount(100);
  const downloadPromise = page.waitForEvent("download");
  await register
    .getByRole("button", { name: "Export loaded rows (CSV)", exact: true })
    .click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.split("\r\n")).toHaveLength(101);
  expect(csv).toContain('"Branch scope","ID","Reference"');
  expect(csv).toContain("TEST history");
  await context.setOffline(true);
  await expect(
    register.getByRole("button", { name: "Apply dates", exact: true }),
  ).toBeDisabled();
  await expect(register.locator("tbody tr")).toHaveCount(100);
  await context.setOffline(false);
  await expect(register.locator("tbody tr")).toHaveCount(50);
  await register.getByLabel("From date", { exact: true }).fill("2099-01-01");
  await register.getByLabel("Through date", { exact: true }).fill("2099-01-01");
  await register
    .getByRole("button", { name: "Apply dates", exact: true })
    .click();
  await expect(
    register.getByRole("heading", {
      name: "No records match these dates.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    register.getByRole("button", {
      name: "Export loaded rows (CSV)",
      exact: true,
    }),
  ).toBeDisabled();
  await register.getByLabel("From date", { exact: true }).fill("2099-01-02");
  await register
    .getByRole("button", { name: "Apply dates", exact: true })
    .click();
  await expect(register.getByRole("alert")).toContainText("end date");
  await expect(register.getByLabel("From date", { exact: true })).toHaveValue(
    "2099-01-02",
  );
  await register
    .getByRole("button", { name: "Clear dates", exact: true })
    .click();
  await expect(register.locator("tbody tr")).toHaveCount(50);
  for (const width of [1440, 390, 418]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      register.getByRole("button", { name: "Apply dates", exact: true }),
    ).toBeVisible();
    if (width === 390) {
      const scrollArea = register.getByRole("region", {
        name: "Receiving history records",
        exact: true,
      });
      await scrollArea.focus();
      const before = await scrollArea.evaluate((el) => el.scrollLeft);
      await scrollArea.press("ArrowRight");
      await expect
        .poll(() => scrollArea.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(before);
    }
  }
  await page
    .getByRole("combobox", { name: "Current branch", exact: true })
    .selectOption(a.branches[2].id as string);
  const empty = page.getByRole("region", {
    name: "Receiving history",
    exact: true,
  });
  await expect(
    empty.getByRole("heading", {
      name: "No receiving records yet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    empty.getByRole("button", {
      name: "Export loaded rows (CSV)",
      exact: true,
    }),
  ).toBeDisabled();
});

test("receipt history crosses 1000 rows without losing equal-microsecond timestamps", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const a = await business();
  await page.goto("/");
  await login(page, a);
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Audit feeds" }),
  ).toBeEnabled();
  const shift = await a.owner
    .from("cashier_shifts")
    .select("id,device_id,cashier_id")
    .eq("organization_id", a.organizationId)
    .is("closed_at", null)
    .single();
  expect(shift.error).toBeNull();
  const occurredAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".123456Z");
  const expected = new Set<string>();
  for (let offset = 0; offset < 1005; offset += 25) {
    await Promise.all(
      Array.from({ length: Math.min(25, 1005 - offset) }, async () => {
        const transactionId = randomUUID();
        expected.add(transactionId);
        await command(a.owner, "record_sale", {
          version: 1,
          transactionId,
          organizationId: a.organizationId,
          branchId: a.branchId,
          deviceId: shift.data!.device_id,
          cashierId: shift.data!.cashier_id,
          shiftId: shift.data!.id,
          occurredAt,
          total: 100,
          cashReceived: 100,
          items: [
            {
              productId: a.productId,
              unitId: a.unitId,
              batchId: null,
              name: "Audit feeds",
              unitName: "Kilo",
              quantity: "1",
              factor: "1",
              unitPrice: 100,
              unitCost: 50,
              priceVersion: 1,
              lineTotal: 100,
            },
          ],
        });
      }),
    );
  }
  await page
    .getByRole("button", { name: "Sales & receipts", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await page
    .getByRole("button", { name: "Load older receipts", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(100);
  const actual = new Set<string>();
  let before;
  do {
    const result = await salesPage(
      a.organizationId,
      a.branchId,
      before,
      a.owner,
    );
    for (const row of result.rows) {
      expect(actual.has(String(row.id))).toBe(false);
      actual.add(String(row.id));
    }
    before = result.next;
  } while (before);
  expect(actual).toEqual(expected);
  const wrongBranch = await salesPage(
    a.organizationId,
    a.branches[1].id,
    undefined,
    a.owner,
  );
  expect(wrongBranch.rows).toEqual([]);
});


test("partial transfers, held goods and stock issues reconcile through the owner screens", async ({page})=>{
  const a=await business(); const destination=a.branches[1].id as string;
  const transferId=randomUUID();
  await command(a.owner,"dispatch_transfer",{organizationId:a.organizationId,branchId:a.branchId,transferId,productId:a.productId,batchId:null,quantity:"10",destinationBranchId:destination});
  await page.goto("/"); await login(page,a);
  await page.getByRole("combobox",{name:"Current branch",exact:true}).selectOption(destination);
  await expect(page.getByText("Branch stock loaded.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Transfers",exact:true}).click();
  const row=page.locator('.history-table[data-kind="transfers"] tbody tr');
  await row.getByRole("button",{name:"Confirm receipt",exact:true}).click();
  await row.getByLabel("Saleable quantity actually received (base units)").fill("8");
  await row.getByLabel("Damaged / held quantity received (base units)").fill("1");
  await row.getByLabel("Receiving notes",{exact:true}).fill("TEST counted eight sound, one damaged, one missing");
  await row.getByRole("button",{name:"Record actual receipt",exact:true}).click();
  await expect(row).toContainText("Outstanding: 1");
  await page.getByRole("button",{name:"Inventory",exact:true}).click();
  await expect(page.getByRole("region",{name:"Held stock",exact:true})).toContainText("1");
  await page.getByRole("button",{name:"Resolve investigation",exact:true}).click();
  const resolve=page.getByRole("form",{name:"Resolve investigation",exact:true});
  await resolve.getByLabel("Evidence and outcome",{exact:true}).fill("TEST investigation still awaiting physical goods");
  await resolve.getByRole("button",{name:"Record resolution",exact:true}).click();
  await expect(resolve.getByRole("alert")).toContainText("Receive or record the missing transfer quantity");
  await page.getByRole("button",{name:"Transfers",exact:true}).click();
  await row.getByRole("button",{name:"Record missing transfer goods",exact:true}).click();
  await row.getByLabel("Missing transfer quantity (base units)").fill("1");
  await row.getByLabel("Investigation evidence / loss reason",{exact:true}).fill("TEST owner checked dispatch and delivery, missing one kilogram");
  await row.getByRole("button",{name:"Record transfer loss",exact:true}).click();
  await expect(row).toContainText("closed short");
  await page.getByRole("button",{name:"Inventory",exact:true}).click();
  const held=page.getByRole("region",{name:"Held stock",exact:true});
  await held.getByRole("button",{name:"Record held-goods outcome",exact:true}).click();
  await held.getByLabel("Quantity from held stock (base units)").fill("0.25");
  await held.getByLabel("Held-goods outcome",{exact:true}).selectOption("release");
  await held.getByLabel("Inspection / disposition reason",{exact:true}).fill("TEST inspected quarter kilogram is saleable");
  await held.getByRole("button",{name:"Record outcome",exact:true}).click();
  await expect(held.getByRole("cell",{name:"0.75",exact:true})).toBeVisible();
  const issue=page.getByRole("form",{name:"Record stock issue",exact:true});
  await issue.getByLabel("Issue quantity (base units)").fill("0.5");
  await issue.getByLabel("Issue evidence / reason").fill("TEST damaged stock weighed separately");
  await issue.getByRole("button",{name:"Submit stock issue",exact:true}).click();
  const pending=page.getByRole("region",{name:"Stock issues awaiting approval",exact:true});
  await pending.getByRole("button",{name:"Approve stock issue",exact:true}).click();
  await pending.getByLabel("Approval notes",{exact:true}).fill("TEST owner verified damaged quantity");
  await pending.getByRole("button",{name:"Approve issue",exact:true}).click();
  await expect(pending).not.toBeVisible();
  const inventory=await a.owner.from("branch_inventory").select("quantity").eq("branch_id",destination).eq("product_id",a.productId).single();
  expect(inventory.error).toBeNull(); expect(Number(inventory.data!.quantity)).toBe(7.75);
  const holds=await a.owner.from("stock_holds").select("remaining").eq("branch_id",destination);
  expect(holds.error).toBeNull(); expect(holds.data!.reduce((sum,h)=>sum+Number(h.remaining),0)).toBe(1.25);
  const activeHold=held.getByRole("row").filter({hasText:"TEST counted eight sound, one damaged, one missing"});
  await activeHold.getByRole("button",{name:"Record held-goods outcome",exact:true}).click();
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const contained=await activeHold.evaluate(row=>{
      const region=row.closest('[role="region"]')!.getBoundingClientRect();
      return [...row.querySelectorAll('td,.approval-form,input,select')].every(el=>{
        const rect=el.getBoundingClientRect();return rect.left>=region.left-1 && rect.right<=region.right+1;
      });
    });
    expect(contained).toBe(true);
    const scan=await new AxeBuilder({page}).include('main').withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({path:`test-results/stock-controls-${width}.png`,fullPage:true});
  }
});
