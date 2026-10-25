import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Sale } from "@agristore/domain";

const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (
  process.env.AGRISTORE_LOCAL_INTEGRATION !== "1" ||
  api !== "http://127.0.0.1:55321" ||
  !key
) {
  throw new Error(
    "Hosted projects are prohibited for these integration fixtures.",
  );
}
function client() {
  return createClient(api!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function command<T>(
  user: SupabaseClient,
  action: string,
  data: Record<string, unknown>,
): Promise<T> {
  const result = await user.rpc("agri_command", { action, data });
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data as T;
}
async function login(page: Page, email: string, password: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Checkout/ }).click();
}
async function openShift(page: Page, opening: string) {
  await page.getByLabel("Opening cash (₱)", { exact: true }).fill(opening);
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Integration feeds" }),
  ).toBeEnabled();
}
async function buy(page: Page) {
  await page.getByRole("button", { name: "Add Integration feeds" }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("2000");
  await page
    .getByRole("button", { name: "Complete cash sale", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sale saved.", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("₱420.00 change", { exact: true })).toBeVisible();
}

async function remainingSyncLock(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open("agristore-live-v1");
        request.onerror = () => resolve(-1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("locks", "readonly");
          const lock = tx.objectStore("locks").get("sync");
          lock.onsuccess = () =>
            resolve(
              Math.max(0, Number(lock.result?.expiresAt ?? 0) - Date.now()),
            );
          tx.oncomplete = () => db.close();
        };
      }),
  );
}

test.afterEach(async ({ page }, result) => {
  if (result.status === result.expectedStatus) return;
  // Account artifact quotas must not hide the failing boundary. These fields
  // contain only test queue states and UI messages, never Auth headers/tokens.
  console.log(
    "Integration failure state:",
    JSON.stringify({
      queue: await page
        .locator(".status-tag")
        .allTextContents()
        .catch(() => []),
      notices: await page
        .locator(".notice")
        .allTextContents()
        .catch(() => []),
      syncLockMsRemaining: await remainingSyncLock(page).catch(() => -1),
    }),
  );
});

test("registered cashier recovers real offline sales after a lost acknowledgment and retains sales after revocation", async ({
  page,
  context,
}) => {
  const owner = client(),
    cashier = client();
  const password = `Agri-${randomUUID()}!`;
  const ownerEmail = `owner-${randomUUID()}@example.com`;
  const cashierEmail = `cashier-${randomUUID()}@example.com`;
  for (const [user, email] of [
    [owner, ownerEmail],
    [cashier, cashierEmail],
  ] as const) {
    const signup = await user.auth.signUp({ email, password });
    if (signup.error || !signup.data.session)
      throw new Error(
        `Disposable local signup failed: ${signup.error?.message ?? "verify local email confirmation is disabled"}`,
      );
  }
  const { organizationId } = await command<{ organizationId: string }>(
    owner,
    "bootstrap",
    {
      name: `Integration ${randomUUID()}`,
      ownerName: "Integration owner",
    },
  );
  const branchResult = await owner
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .order("code");
  expect(branchResult.error).toBeNull();
  expect(branchResult.data).toHaveLength(3);
  const branchId = branchResult.data![0].id as string;
  const scope = { organizationId, branchId };
  const { id: productId } = await command<{ id: string }>(
    owner,
    "create_product",
    {
      ...scope,
      name: "Integration feeds",
      sku: "INT-FEED",
      category: "Feeds",
      baseUnit: "kg",
      minimumStock: "0",
      tracksExpiry: false,
      units: [
        { name: "Sack (50 kg)", factor: "50", price: 158000, cost: 138000 },
      ],
    },
  );
  const unit = await owner
    .from("product_units")
    .select("id")
    .eq("product_id", productId)
    .single();
  expect(unit.error).toBeNull();
  await command(owner, "receive_stock", {
    ...scope,
    receiptId: randomUUID(),
    source: "purchase",
    reference: "Disposable integration stock",
    items: [
      {
        productId,
        unitId: unit.data!.id,
        quantity: "10",
        lot: "",
        expiresOn: null,
      },
    ],
  });
  await command(owner, "staff_access", {
    ...scope,
    email: cashierEmail,
    role: "cashier",
    name: "Integration cashier",
  });

  const cloudRequests: string[] = [];
  await context.route(/https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    cloudRequests.push(new URL(route.request().url()).hostname);
    await route.abort();
  });
  await page.goto("/");
  // Exercise the manager's real PC registration, shift closure, and user switch.
  await login(page, ownerEmail, password);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const branchPanel = page.locator(".panel").filter({
    has: page.getByRole("heading", { name: "Branches", exact: true }),
  });
  await branchPanel.getByLabel("New branch name", { exact: true }).fill("   ");
  await branchPanel
    .getByRole("button", { name: "Add branch", exact: true })
    .click();
  await expect(branchPanel.getByRole("alert")).toContainText(
    "Enter a branch name",
  );
  await expect(
    branchPanel.getByLabel("New branch name", { exact: true }),
  ).toHaveValue("   ");
  for (const name of [
    "Integration fourth branch",
    "Integration fifth branch",
  ]) {
    await page.getByLabel("New branch name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Add branch", exact: true }).click();
    await expect(
      page.getByLabel("New branch name", { exact: true }),
    ).toHaveValue("");
    await expect(branchPanel.getByRole("status")).toContainText(
      "Branch added.",
    );
    await expect(
      page
        .getByRole("combobox", { name: "Current branch", exact: true })
        .locator("option", {}),
    ).toContainText([name]);
  }
  const concurrent = await Promise.all(
    [6, 7].map((n) =>
      command<{ id: string }>(owner, "create_branch", {
        organizationId,
        newBranchId: randomUUID(),
        name: `Concurrent branch ${n}`,
      }),
    ),
  );
  expect(new Set(concurrent.map((result) => result.id)).size).toBe(2);
  const expanded = await owner
    .from("branches")
    .select("code")
    .eq("organization_id", organizationId);
  expect(expanded.error).toBeNull();
  expect(expanded.data).toHaveLength(7);
  expect(new Set(expanded.data!.map((branch) => branch.code)).size).toBe(7);
  const deniedBranch = await cashier.rpc("agri_command", {
    action: "create_branch",
    data: {
      organizationId,
      newBranchId: randomUUID(),
      name: "Forbidden cashier branch",
    },
  });
  expect(deniedBranch.error?.code).toBe("42501");
  await page.getByRole("button", { name: /^Checkout/ }).click();
  const branchPicker = page.getByRole("combobox", {
    name: "Current branch",
    exact: true,
  });
  await branchPicker.selectOption({ label: "Integration fourth branch" });
  await expect(
    page.getByRole("article").filter({
      has: page.getByRole("button", {
        name: "Add Integration feeds",
      }),
    }),
  ).toContainText("0 kg on hand");
  await branchPicker.selectOption(branchId);
  await expect(
    page.getByRole("article").filter({
      has: page.getByRole("button", {
        name: "Add Integration feeds",
      }),
    }),
  ).toContainText("500 kg on hand");
  await expect(branchPicker).toBeEnabled();
  await context.setOffline(true);
  await expect(branchPicker).toBeDisabled();
  await context.setOffline(false);
  await openShift(page, "0");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Cash counted in drawer (₱)").fill("0");
  await page
    .getByRole("button", { name: "Reconcile & close shift", exact: true })
    .click();
  await expect(
    page.getByText("No cashier shift is open. Open one from Checkout.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByTitle("Sign out", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  // UI sign-out revokes all of this owner's sessions; renew the fixture's API session.
  const renewed = await owner.auth.signInWithPassword({
    email: ownerEmail,
    password,
  });
  expect(renewed.error).toBeNull();
  await login(page, cashierEmail, password);
  await openShift(page, "500");
  await page.waitForFunction(() =>
    navigator.serviceWorker.ready.then(() => true),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add Integration feeds" }),
  ).toBeEnabled();

  const forbidden = await cashier.rpc("agri_command", {
    action: "create_product",
    data: { ...scope, name: "Forbidden" },
  });
  expect(forbidden.error?.code).toBe("42501");
  const wrongBranch = await cashier.rpc("agri_command", {
    action: "snapshot",
    data: {
      organizationId,
      branchId: branchResult.data![1].id,
      transactionIds: [],
    },
  });
  expect(wrongBranch.error?.code).toBe("42501");

  await context.setOffline(true);
  await buy(page);
  await buy(page);
  await page.reload();
  await page.getByRole("button", { name: "Sync center", exact: false }).click();
  const queue = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Saved transaction queue",
      exact: true,
    }),
  });
  await expect(queue.locator("tbody tr")).toHaveCount(2);
  const before = await owner
    .from("sales")
    .select("id")
    .eq("organization_id", organizationId);
  expect(before.error).toBeNull();
  expect(before.data).toEqual([]);

  let blockRecovery = true;
  let lostId: string | undefined;
  const acknowledgments: { id: string; status: string }[] = [];
  await page.route(`${api}/rest/v1/rpc/agri_command`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as {
      action: string;
      data: Sale;
    };
    if (
      blockRecovery &&
      lostId &&
      ["record_sale", "snapshot"].includes(body.action)
    )
      return route.abort("connectionreset");
    if (body.action !== "record_sale") return route.continue();
    const response = await route.fetch();
    const ack = (await response.json()) as {
      transactionId: string;
      status: string;
    };
    expect(response.ok()).toBe(true);
    acknowledgments.push({ id: ack.transactionId, status: ack.status });
    if (blockRecovery) {
      lostId = body.data.transactionId;
      return route.abort("connectionreset");
    }
    return route.fulfill({ response });
  });
  console.log(
    "Interrupted browser sync lock remaining (ms):",
    await remainingSyncLock(page),
  );
  await context.setOffline(false);
  // Reload can interrupt a sync holding its persisted 45-second lease. Allow
  // lease recovery plus the 15-second automatic sync interval before failing.
  await expect.poll(() => lostId, { timeout: 75_000 }).toBeTruthy();
  await expect(queue.locator(".status-tag").first()).toContainText("retryable");
  const committed = await owner
    .from("sales")
    .select("id")
    .eq("organization_id", organizationId);
  expect(committed.error).toBeNull();
  expect(committed.data).toEqual([{ id: lostId }]);

  blockRecovery = false;
  await queue
    .locator("tbody tr")
    .filter({ hasText: lostId!.slice(0, 8) })
    .getByRole("button", { name: "Retry original sale", exact: true })
    .click();
  await expect
    .poll(
      async () => (await queue.locator(".status-tag").allTextContents()).sort(),
      { timeout: 40_000 },
    )
    .toEqual(["synced", "synced"]);
  expect(
    acknowledgments.some(
      (ack) => ack.id === lostId && ack.status === "duplicate",
    ),
  ).toBe(true);
  const saved = await owner
    .from("sales")
    .select("id,payload,total,shift_id")
    .eq("organization_id", organizationId);
  expect(saved.error).toBeNull();
  expect(saved.data).toHaveLength(2);
  expect(new Set(saved.data!.map((sale) => sale.id)).size).toBe(2);
  expect(saved.data!.map((sale) => sale.total)).toEqual([158000, 158000]);
  for (const table of ["payments", "sale_items"]) {
    const result = await owner
      .from(table)
      .select("id")
      .eq("organization_id", organizationId);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
  }
  const movements = await owner
    .from("inventory_movements")
    .select("quantity,source_id")
    .eq("organization_id", organizationId)
    .eq("kind", "sale");
  expect(movements.error).toBeNull();
  expect(movements.data).toHaveLength(2);
  expect(movements.data!.map((movement) => Number(movement.quantity))).toEqual([
    -50, -50,
  ]);
  const stock = await owner
    .from("branch_inventory")
    .select("quantity")
    .eq("branch_id", branchId)
    .eq("product_id", productId)
    .single();
  expect(stock.error).toBeNull();
  expect(Number(stock.data!.quantity)).toBe(400);
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await expect(
    page.getByRole("article").filter({
      has: page.getByRole("button", {
        name: "Add Integration feeds",
      }),
    }),
  ).toContainText("400 kg on hand");

  await context.setOffline(true);
  await buy(page);
  const membership = await owner
    .from("staff_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("role", "cashier")
    .single();
  expect(membership.error).toBeNull();
  await command(owner, "revoke_staff", {
    ...scope,
    membershipId: membership.data!.id,
  });
  await page.getByRole("button", { name: /Sync center/ }).click();
  await context.setOffline(false);
  await expect(queue.locator("tbody tr")).toHaveCount(3);
  await expect(
    queue.locator("tbody tr").filter({ hasText: "authentication required" }),
  ).toHaveCount(1);
  const final = await owner
    .from("sales")
    .select("id")
    .eq("organization_id", organizationId);
  expect(final.error).toBeNull();
  expect(final.data).toHaveLength(2);
  expect(cloudRequests).toEqual([]);
});
