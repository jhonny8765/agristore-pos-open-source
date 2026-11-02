import {defineConfig} from "@playwright/test";

// These existing cases enter isolated, local-only Practice mode. Genuine Auth
// and financial mutation tests still belong in the disposable Supabase gate.
const origin=process.env.AGRISTORE_PUBLISHED_ORIGIN;
if(!origin)throw new Error("Set the published Pages origin explicitly.");
const url=new URL(origin);
if(url.origin!==origin||url.protocol!=="https:"||!url.hostname.endsWith(".pages.dev"))throw new Error("Use a plain HTTPS Pages origin.");
export default defineConfig({
  testDir:"tests/e2e",
  testMatch:["brand.spec.ts","checkout.spec.ts","weighed-checkout.spec.ts","security.spec.ts","support-report.spec.ts","browser-storage.spec.ts"],
  // The restart case intentionally uses a fixed loopback origin. Large local
  // retention capacity has already passed; do not seed 100k receipts per visit.
  grepInvert:/real browser process restart|100000 retained receipts/,
  outputDir:"test-results/published",
  workers:1,
  fullyParallel:false,
  timeout:60_000,
  expect:{timeout:15_000},
  reporter:[["list"],["json",{outputFile:"test-results/published-report.json"}]],
  use:{baseURL:origin,storageState:{cookies:[],origins:[]},trace:"off",screenshot:"only-on-failure"},
});
