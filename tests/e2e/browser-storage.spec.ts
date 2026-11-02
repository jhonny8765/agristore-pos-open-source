import { test, expect } from "@playwright/test";

// Fault injection is confined to disposable test profiles. These tests never
// establish that a user's actual browser has granted persistence.
test("storage requests are explicit and denied/failed checks retain pending receipts", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "storage", { value: {
      persisted: async () => false,
      persist: async () => { calls++; if (calls > 1) throw new Error("request blocked"); return false; },
      estimate: async () => ({ usage: 100, quota: 1e9 }),
    } });
    Object.defineProperty(window, "storageRequestCount", { get: () => calls });
  });
  await page.goto("/"); await page.getByRole("button", { name: "Try practice checkout", exact: true }).click();
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Complete cash sale", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sale saved.", exact: true })).toBeVisible();
  const records = () => page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const open = indexedDB.open("agristore-practice-v1");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction("sales", "readonly"), rows = tx.objectStore("sales").getAll();
      rows.onsuccess = () => resolve(rows.result); tx.oncomplete = () => db.close(); tx.onerror = () => reject(tx.error);
    };
  }));
  const before = await records(); expect(before).toHaveLength(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("region", { name: "Browser storage protection", exact: true });
  await expect(panel).toContainText("Persistent storage is not granted.");
  expect(await page.evaluate(() => (window as unknown as { storageRequestCount: number }).storageRequestCount)).toBe(0);
  await panel.getByRole("button", { name: "Check storage protection", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { storageRequestCount: number }).storageRequestCount)).toBe(1);
  await panel.getByRole("button", { name: "Check storage protection", exact: true }).click();
  await expect(panel).toContainText("The protection request failed");
  expect(await records()).toEqual(before);
  await page.reload(); await page.getByRole("button", { name: "Settings", exact: true }).click();
  expect(await records()).toEqual(before);
  await expect(panel).toContainText("Never clear browsing data");
});

test("a quota failure preserves a verified grant and has no mobile overflow", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "storage", { value: {
    persisted: async () => true, estimate: async () => { throw new Error("quota unavailable"); },
  } }));
  await page.goto("/"); await page.getByRole("button", { name: "Try practice checkout", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("region", { name: "Browser storage protection", exact: true });
  await expect(panel).toContainText("Persistent storage granted."); await expect(panel).toContainText("Usage estimate unavailable.");
  await expect(page.getByRole("region", { name: "PC checks and store guide", exact: true })).toContainText("Storage protection is granted.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("an early install offer is available in Settings and cancellation remains recoverable", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Try practice checkout", exact: true }).click();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("region", { name: "Browser storage protection", exact: true });
  await panel.getByRole("button", { name: /Install (Better Yield|AgriStore) on this PC/ }).click();
  await expect(panel).toContainText("Installation cancelled.");
  await expect(panel.getByRole("button", { name: /Install (Better Yield|AgriStore) on this PC/ })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Check storage protection", exact: true })).toBeEnabled();
});
