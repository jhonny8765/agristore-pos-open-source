import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("catalog weight and peso choices start at the right field without charging an unfinished kilo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try practice checkout" }).click();
  await page
    .getByRole("button", { name: "Sell Grower feeds by weight", exact: true })
    .click();
  const quantity = page.getByLabel(/^Quantity \(.+\) for Grower feeds$/);
  await expect(quantity).toHaveValue("");
  await expect(quantity).toHaveAccessibleName("Quantity (kg) for Grower feeds");
  await expect(quantity).toBeFocused();
  await expect(page.locator(".amount-due")).toContainText("₱0.00");
  await expect(complete(page)).toBeDisabled();
  await quantity.pressSequentially("0.5");
  await expect(page.locator(".amount-due")).toContainText("₱16.80");
  await page
    .getByRole("button", {
      name: "Sell Grower feeds by peso amount",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Customer budget (₱) for Grower feeds"),
  ).toBeFocused();
  await expect(
    page.getByLabel("Customer budget (₱) for Grower feeds"),
  ).toHaveAccessibleName("Customer budget (₱) for Grower feeds");
  await expect(complete(page)).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancel peso entry", exact: true })
    .click();
  await expect(page.locator(".receipt-item")).toHaveCount(1);
  await expect(page.locator(".amount-due")).toContainText("₱16.80");
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await expect(page.locator(".amount-due")).toContainText("₱1,596.80");
  await page
    .getByRole("button", { name: "Sell Hybrid corn seeds by weight" })
    .count()
    .then((count) => expect(count).toBe(0));
  for (const width of [1440, 390, 418, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .include(".product-grid")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
  }
});

async function practice(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try practice checkout" }).click();
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
}
const complete = (page: Page) =>
  page.getByRole("button", { name: "Complete cash sale" });

test("blank and cleared weights can switch units without reviving a previous charge", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try practice checkout" }).click();
  await page.getByRole("button", { name: "Sell Grower feeds by weight", exact: true }).click();
  const entry = page.getByLabel("Weight entry for Grower feeds");
  const weight = page.getByLabel(/^Quantity \(.+\) for Grower feeds$/);
  const due = page.locator(".amount-due strong");
  await entry.selectOption("g");
  await expect(entry).toHaveValue("g");
  await expect(weight).toHaveAccessibleName("Quantity (g) for Grower feeds");
  await expect(weight).toHaveValue("");
  await expect(due).toHaveText("₱0.00");
  await expect(complete(page)).toBeDisabled();
  await weight.fill("250");
  await expect(due).toHaveText("₱8.40");
  await entry.selectOption("kg");
  await expect(weight).toHaveValue("0.25");
  await expect(due).toHaveText("₱8.40");
  await weight.fill("");
  await entry.selectOption("g");
  await expect(entry).toHaveValue("g");
  await expect(weight).toHaveValue("");
  await expect(due).toHaveText("₱0.00");
  await expect(complete(page)).toBeDisabled();
  await entry.selectOption("kg");
  await expect(entry).toHaveValue("kg");
  await expect(weight).toHaveValue("");
  for (const invalid of ["0.", "1/", "-1", "1/0"]) {
    await weight.fill(invalid);
    await entry.selectOption("g");
    await expect(entry).toHaveValue("kg");
    await expect(weight).toHaveValue(invalid);
    await expect(due).toHaveText("₱0.00");
    await expect(complete(page)).toBeDisabled();
  }
  await weight.fill("1/4");
  await entry.selectOption("g");
  await expect(weight).toHaveValue("250");
  await expect(due).toHaveText("₱8.40");
  for (const [grams, kg, amount] of [["100", "0.1", "₱3.36"], ["500", "0.5", "₱16.80"], ["250", "0.25", "₱8.40"]]) {
    await weight.fill(grams);
    await entry.selectOption("kg");
    await expect(weight).toHaveValue(kg);
    await expect(due).toHaveText(amount);
    await entry.selectOption("g");
    await expect(weight).toHaveValue(grams);
    await expect(due).toHaveText(amount);
  }
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.getByLabel("Cash received", { exact: true }).fill("10");
  await complete(page).click();
  await expect(page.getByText("₱1.60 change", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Sales & receipts", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("8.40");
});

test("a grams-first peso request still requires actual weight confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try practice checkout" }).click();
  await page.getByRole("button", { name: "Sell Grower feeds by peso amount", exact: true }).click();
  await page.getByLabel("Customer budget (₱) for Grower feeds").fill("50");
  await page.getByLabel("Weight entry for Grower feeds").selectOption("g");
  const weight = page.getByLabel("Quantity (g) for Grower feeds", { exact: true });
  await expect(weight).toHaveValue("");
  await expect(complete(page)).toBeDisabled();
  await weight.fill("500");
  await expect(page.locator(".amount-due strong")).toHaveText("₱16.80");
  await expect(complete(page)).toBeDisabled();
  await page.getByRole("button", { name: "Confirm weighed amount", exact: true }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("20");
  await complete(page).click();
  await expect(page.getByText("₱3.20 change", { exact: true })).toBeVisible();
});

test("normal keystrokes accept half kilos and fractions; invalid drafts cannot charge the previous quantity", async ({
  page,
}) => {
  await practice(page);
  await page
    .getByLabel("Unit for Grower feeds")
    .selectOption({ label: "Kilo" });
  const input = page.getByLabel(/^Quantity \(.+\) for Grower feeds$/);
  await input.fill("");
  await input.pressSequentially("0.");
  await expect(input).toHaveValue("0.");
  await expect(complete(page)).toBeDisabled();
  await page.getByLabel("Cash received", { exact: true }).fill("100");
  await page.getByLabel("Cash received", { exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Sale saved." })).toHaveCount(
    0,
  );
  await input.fill("");
  await input.pressSequentially("0.5");
  await expect(input).toHaveValue("0.5");
  await expect(page.locator(".receipt-item-bottom")).toContainText("₱16.80");
  await expect(complete(page)).toBeEnabled();
  await input.fill("");
  await input.pressSequentially("1/4");
  await input.press("Tab");
  await expect(input).toHaveValue("0.25");
  await expect(page.locator(".receipt-item-bottom")).toContainText("₱8.40");
  await expect(
    page.getByRole("button", { name: "Decrease Grower feeds" }),
  ).toBeDisabled();
  await complete(page).click();
  await expect(page.getByText("₱91.60 change")).toBeVisible();
});

test("peso estimates require measured confirmation across navigation, and grams set the final amount", async ({
  page,
  context,
}) => {
  await practice(page);
  await page.waitForFunction(() =>
    navigator.serviceWorker.ready.then(() => true),
  );
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "By peso amount", exact: true })
    .click();
  await page.getByLabel("Customer budget (₱) for Grower feeds").fill("50");
  await page
    .getByRole("button", { name: "Estimate weight", exact: true })
    .click();
  await expect(page.getByLabel(/^Quantity \(.+\) for Grower feeds$/)).toHaveValue(
    "1.488",
  );
  await expect(complete(page)).toBeDisabled();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await expect(page.getByLabel("Customer budget (₱) for Grower feeds")).toHaveValue(
    "50",
  );
  await expect(complete(page)).toBeDisabled();
  await page.getByLabel("Weight entry for Grower feeds").selectOption("g");
  await expect(
    page.getByLabel(/^Quantity \(.+\) for Grower feeds$/),
  ).toHaveAccessibleName("Quantity (g) for Grower feeds");
  await page.getByLabel(/^Quantity \(.+\) for Grower feeds$/).fill("1500");
  await expect(page.locator(".receipt-item-bottom")).toContainText("₱50.40");
  await expect(complete(page)).toBeDisabled();
  await page
    .getByRole("button", { name: "Confirm weighed amount", exact: true })
    .click();
  await page.getByLabel("Cash received", { exact: true }).fill("100");
  await complete(page).click();
  await expect(page.getByText("₱49.60 change")).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Sales & receipts", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("50.40");
});

test("shortcuts select the retail kilo price, cancel restores a sack, and duplicate drafts stay on their own row", async ({
  page,
}) => {
  await practice(page);
  await page.getByLabel(/^Quantity \(.+\) for Grower feeds$/).fill("2");
  await page
    .getByRole("button", { name: "By peso amount", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel peso entry", exact: true })
    .click();
  await expect(page.getByLabel(/^Quantity \(.+\) for Grower feeds$/)).toHaveValue("2");
  await expect(page.getByLabel("Unit for Grower feeds")).toHaveValue(/.+/);
  await expect(page.locator(".receipt-item-bottom")).toContainText("₱3,160.00");
  await page.getByRole("button", { name: "¼ kg", exact: true }).click();
  await expect(page.locator(".line-rate")).toContainText("₱33.60 / Kilo");
  await page.getByLabel("Weight entry for Grower feeds").selectOption("g");
  await expect(page.getByLabel(/^Quantity \(.+\) for Grower feeds$/)).toHaveValue("250");
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await page.getByLabel(/^Quantity \(.+\) for Grower feeds$/).nth(1).fill("0.");
  await page
    .getByRole("button", { name: "Remove Grower feeds" })
    .first()
    .click();
  await expect(page.getByLabel(/^Quantity \(.+\) for Grower feeds$/)).toHaveValue("0.");
  await expect(complete(page)).toBeDisabled();
  await page.getByRole("button", { name: "Remove Grower feeds" }).click();
  await expect(page.locator(".receipt-item")).toHaveCount(0);
});

test("invalid edits hide stale prices while valid items and unconfirmed peso estimates retain their amounts", async ({ page }) => {
  await practice(page);
  await page.getByLabel("Unit for Grower feeds").selectOption({ label: "Kilo" });
  await page.getByLabel("Quantity (kg) for Grower feeds", { exact: true }).fill("0.5");
  await page.getByRole("button", { name: "Add Animal vitamin mix" }).click();
  const feed = page.locator(".receipt-item").filter({ hasText: "Grower feeds" });
  const vitamin = page.locator(".receipt-item").filter({ hasText: "Animal vitamin mix" });
  const due = page.locator(".amount-due strong");
  await expect(due).toHaveText("₱161.80");
  const weight = page.getByLabel("Quantity (kg) for Grower feeds", { exact: true });
  await weight.fill("");
  await weight.pressSequentially("0.");
  await expect(weight).toHaveValue("0.");
  await expect(due).toHaveText("₱145.00");
  await expect(feed.locator(".receipt-item-bottom strong")).toHaveText("Enter weight");
  await expect(feed.locator(".line-measure")).toHaveCount(0);
  await expect(complete(page)).toBeDisabled();
  await weight.fill("1/0");
  await expect(due).toHaveText("₱145.00");
  await weight.fill(".5");
  await expect(due).toHaveText("₱161.80");
  await expect(feed.locator(".line-measure")).toContainText("500 g");
  await page.getByLabel("Weight entry for Grower feeds").selectOption("g");
  const grams = page.getByLabel("Quantity (g) for Grower feeds", { exact: true });
  await expect(grams).toHaveValue("500");
  await grams.fill("0.");
  await expect(due).toHaveText("₱145.00");
  await grams.fill("500");
  await page.getByLabel("Quantity (Sachet) for Animal vitamin mix", { exact: true }).fill("0.5");
  await expect(due).toHaveText("₱16.80");
  await expect(vitamin.locator(".receipt-item-bottom strong")).toHaveText("Enter quantity");
  await expect(complete(page)).toBeDisabled();
  await page.getByLabel("Quantity (Sachet) for Animal vitamin mix", { exact: true }).fill("2");
  await expect(due).toHaveText("₱306.80");
  await page.getByLabel("Cash received", { exact: true }).fill("100");
  await complete(page).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("Cash received is below the amount due");
  await expect(page.getByRole("heading", { name: "Sale saved.", exact: true })).toHaveCount(0);
  await page.getByLabel("Cash received", { exact: true }).fill("400");
  await complete(page).click();
  await expect(page.getByText("₱93.20 change", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sell Grower feeds by peso amount", exact: true }).click();
  await page.getByLabel("Customer budget (₱) for Grower feeds").fill("50");
  await page.getByRole("button", { name: "Estimate weight", exact: true }).click();
  await expect(due).toHaveText("₱50.00");
  await expect(complete(page)).toBeDisabled();
});

test("piece products cannot be sold as half a sealed packet; weighed controls reflow accessibly", async ({
  page,
}) => {
  await practice(page);
  await page.getByRole("button", { name: "Remove Grower feeds" }).click();
  await page.getByRole("button", { name: "Add Hybrid corn seeds" }).click();
  await page.getByLabel(/^Quantity \(.+\) for Hybrid corn seeds$/).fill("0.5");
  await expect(
    page.getByText("Piece stock must be a whole number", { exact: true }),
  ).toBeVisible();
  await expect(complete(page)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "By peso amount", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(/^Quantity \(.+\) for Hybrid corn seeds$/).fill("1");
  await expect(complete(page)).toBeEnabled();
  await page.getByRole("button", { name: "Remove Hybrid corn seeds" }).click();
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await page
    .getByRole("button", { name: "By peso amount", exact: true })
    .click();
  for (const width of [1440, 390, 418, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .include("#current-sale")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
