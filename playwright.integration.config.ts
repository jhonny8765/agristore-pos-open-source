import { defineConfig } from "@playwright/test";

if (
  process.env.CI !== "true" ||
  process.env.AGRISTORE_LOCAL_INTEGRATION !== "1" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321"
) {
  throw new Error("Use npm run test:integration in the disposable CI stack.");
}

export default defineConfig({
  testDir: "tests/integration",
  outputDir: "test-results/integration",
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    // Auth requests carry disposable credentials. Do not upload traces or HARs.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -w @agristore/web -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
