import {defineConfig} from "@playwright/test";
import integration from "./playwright.integration.config";
if(process.env.AGRISTORE_MAGPET_PILOT!=="1")throw new Error("Use the explicit disposable Magpet pilot runner");
export default defineConfig({
 ...integration,
 outputDir:"test-results/magpet",
 testMatch:["magpet-load.spec.ts","blind-counts.spec.ts","purchasing.spec.ts","delivery-reversals.spec.ts","partial-refunds.spec.ts","refund-corrections.spec.ts","measured-refund-corrections.spec.ts","measured-losses.spec.ts","stock-issue-rejection.spec.ts","stock-loss.spec.ts"],
});
