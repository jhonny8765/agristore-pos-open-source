import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { countCommand, testCountStaff } from "./blind-count-fixtures";
import type { FollowUps } from "../../apps/web/lib/stock-followups";

async function fixture() {
  if (process.env.AGRISTORE_LOCAL_INTEGRATION !== "1" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321") throw new Error("Disposable loopback follow-up fixtures only");
  const owner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `followup-${randomUUID()}@example.invalid`, password = `TEST-${randomUUID()}!`;
  const signup = await owner.auth.signUp({ email, password }); expect(signup.error).toBeNull();
  const { organizationId } = await countCommand<{ organizationId: string }>(owner, "bootstrap", { name: "TEST stock follow-ups", ownerName: "TEST follow-up owner" });
  const branches = await owner.from("branches").select("id").eq("organization_id", organizationId).order("code");
  expect(branches.error).toBeNull(); const branchId = branches.data![0].id as string;
  const a = { owner, email, password, organizationId, branchId };
  const staff = await testCountStaff(a, branchId, "TEST responsible stock employee");
  const ctx = { organizationId, branchId };
  const initial = await countCommand<FollowUps>(owner, "stock_followups", ctx);
  const day = (offset: number) => new Date(Date.parse(initial.today + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
  const { id: productId } = await countCommand<{ id: string }>(owner, "create_product", { ...ctx, name: "TEST expiry feeds", sku: "TEST-EXPIRY", category: "Feeds", baseUnit: "kg", tracksExpiry: true, minimumStock: "0", units: [{ name: "Kilo", factor: "1", price: 3500, cost: 2500 }] });
  const units = await owner.from("product_units").select("id").eq("product_id", productId).single(); expect(units.error).toBeNull();
  await countCommand(owner, "receive_stock", { ...ctx, receiptId: randomUUID(), source: "purchase", reference: "TEST expiry label inspection", items: [
    { productId, unitId: units.data!.id, quantity: "5", lot: "TEST-EXPIRED", expiresOn: day(-1) },
    { productId, unitId: units.data!.id, quantity: "2", lot: "TEST-TODAY", expiresOn: day(0) },
    { productId, unitId: units.data!.id, quantity: "10", lot: "TEST-SOON", expiresOn: day(7) },
    { productId, unitId: units.data!.id, quantity: "3", lot: "TEST-LATER", expiresOn: day(60) },
  ] });
  const batch = await owner.from("product_batches").select("id").eq("product_id", productId).eq("lot", "TEST-SOON").single(); expect(batch.error).toBeNull();
  const issueId = randomUUID();
  await countCommand(owner, "record_stock_issue", { ...ctx, issueId, productId, batchId: batch.data!.id, quantity: "1", category: "damage", disposition: "hold", reason: "TEST damaged package awaiting supplier evidence" });
  await countCommand(owner, "approve_stock_issue", { ...ctx, issueId, reason: "TEST physical damage verified" });
  const before = await countCommand<FollowUps>(owner, "stock_followups", ctx); expect(before.cases).toHaveLength(1);
  return { ...a, ctx, day, staff, before, exceptionId: before.cases[0].id };
}
async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/"); await page.getByLabel("Email address", { exact: true }).fill(account.email); await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Inventory", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Expiry reminders", exact: true })).toBeVisible();
}
test("expiry reminders, responsible staff progress and owner resolution survive independent sign-ins", async ({ page, browser }) => {
  const a = await fixture(); await login(page, a);
  const expiry = page.getByRole("region", { name: "Expiry reminders", exact: true });
  await expect(expiry).toContainText("TEST-EXPIRED"); await expect(expiry).toContainText("Expires today"); await expect(expiry).toContainText("TEST-SOON");
  await expect(expiry).not.toContainText("TEST-LATER"); await expect(expiry).toContainText("Held separately: 1 kg");
  await page.getByLabel("Look ahead", { exact: true }).selectOption("90"); await expect(expiry).toContainText("TEST-LATER");
  await page.getByLabel("Expiry filter", { exact: true }).selectOption("expired"); await expect(expiry.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Expiry filter", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Assign follow-up", exact: true }).click();
  const assignment = page.getByRole("form", { name: "Assign follow-up", exact: true });
  await assignment.getByLabel("Responsible employee", { exact: true }).selectOption(a.staff.userId);
  await assignment.getByLabel("Follow-up due date", { exact: true }).fill(a.day(-1));
  await assignment.getByLabel("Assignment instructions", { exact: true }).fill("TEST obtain supplier acknowledgement for damaged package");
  await assignment.getByRole("button", { name: "Save assignment", exact: true }).click();
  const investigations = page.getByRole("region", { name: "Open stock investigations", exact: true });
  await expect(investigations).toContainText("Responsible: TEST responsible stock employee"); await expect(investigations).toContainText("Overdue");
  const context = await browser.newContext({ timezoneId: "Pacific/Honolulu" });
  try {
    const employee = await context.newPage(); await login(employee, a.staff);
    await employee.getByLabel("Investigation filter", { exact: true }).selectOption("mine");
    await expect(employee.getByRole("button", { name: "Assign follow-up", exact: true })).toHaveCount(0);
    await expect(employee.getByRole("button", { name: "Resolve investigation", exact: true })).toHaveCount(0);
    await employee.getByRole("button", { name: "Record progress", exact: true }).click();
    await employee.getByLabel("Progress evidence", { exact: true }).fill("TEST supplier contacted; documents still outstanding");
    await employee.getByRole("button", { name: "Save progress", exact: true }).click();
    await expect(employee.getByRole("region", { name: "Open stock investigations", exact: true })).toContainText("documents still outstanding");
    await expect(employee.getByRole("region", { name: "Open stock investigations", exact: true })).toContainText("Overdue");
  } finally { await context.close(); }
  await page.getByRole("button", { name: "Refresh reminders and investigations", exact: true }).click();
  await expect(investigations).toContainText("documents still outstanding");
  await page.getByRole("button", { name: "Assign follow-up", exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".stock-followups").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/stock-followups-${width}.png`, fullPage: true });
  }
  await assignment.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Resolve investigation", exact: true }).click();
  await page.getByLabel("Evidence and outcome", { exact: true }).fill("TEST owner verified supplier documents; agreed outcome retained");
  await page.getByRole("button", { name: "Record resolution", exact: true }).click();
  await expect(page.getByText("No unresolved investigations match this filter.", { exact: true })).toBeVisible();
  const after = await countCommand<FollowUps>(a.owner, "stock_followups", { ...a.ctx, horizonDays: 30 });
  expect(after.expiry).toEqual(a.before.expiry); expect(after.totals.open).toBe(0);
  const events = await a.owner.from("stock_control_events").select("action").eq("source_id", a.exceptionId); expect(events.error).toBeNull(); expect(events.data).toHaveLength(2);
});

test("a lost assignment response is recovered with the original request and one audit event", async ({ page, browser }) => {
  const a = await fixture(); await login(page, a);
  let lost = false;
  await page.route("**/rest/v1/rpc/agri_command", async route => {
    if (route.request().postDataJSON().action === "assign_stock_exception" && !lost) { const response = await route.fetch(); expect(response.ok()).toBe(true); lost = true; await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Assign follow-up", exact: true }).click();
  await page.getByLabel("Responsible employee", { exact: true }).selectOption(a.staff.userId);
  await page.getByLabel("Follow-up due date", { exact: true }).fill(a.day(1));
  await page.getByLabel("Assignment instructions", { exact: true }).fill("TEST retained supplier inspection assignment");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click(); await expect.poll(() => lost).toBe(true);
  await page.getByRole("button", { name: /^Sync center(?:\s+\d+)?$/ }).click();
  await expect(page.getByRole("button", { name: "Retry original request", exact: true })).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export recovery file", exact: true }).click();
  const bytes = await readFile((await (await download).path())!); const archive = JSON.parse(bytes.toString());
  expect(archive.pendingOperations).toHaveLength(1); const requestId = archive.pendingOperations[0].data.followUpId;
  const context = await browser.newContext();
  try {
    const restored = await context.newPage(); await login(restored, a); await restored.getByRole("button", { name: /^Sync center(?:\s+\d+)?$/ }).click();
    await restored.getByLabel("Restore a recovery file", { exact: true }).setInputFiles({ name: "TEST-assignment-recovery.json", mimeType: "application/json", buffer: bytes });
    await expect(restored.getByRole("button", { name: "Retry original request", exact: true })).toBeVisible();
    await restored.getByRole("button", { name: "Retry original request", exact: true }).click();
    await expect(restored.getByRole("button", { name: "Retry original request", exact: true })).toHaveCount(0);
  } finally { await context.close(); }
  const events = await a.owner.from("stock_control_events").select("id").eq("source_id", a.exceptionId).eq("action", "assign_stock_exception");
  expect(events.error).toBeNull(); expect(events.data).toEqual([{ id: requestId }]);
  const after = await countCommand<FollowUps>(a.owner, "stock_followups", a.ctx); expect(after.totals.open).toBe(1); expect(after.cases[0].follow_up_version).toBe(1);
  expect(after.expiry).toEqual(a.before.expiry);
});
