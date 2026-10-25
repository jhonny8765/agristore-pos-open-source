import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("AgriStore sign-in loads its original local mark and reflows accessibly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to your store." })).toBeVisible();
  await expect(page).toHaveTitle("AgriStore POS");
  for (const width of [1440, 1024, 390, 418, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const brand = page.locator(width > 730 ? ".auth-story .store-logo" : ".small-brand .store-logo");
    await expect(brand).toBeVisible();
    await expect(brand).toHaveJSProperty("naturalWidth", 192);
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(scan.violations).toEqual([]);
    if (width === 1440 || width === 390)
      await page.screenshot({path:`.impeccable/review/open-source-auth-${width}.png`,fullPage:true});
  }
});
