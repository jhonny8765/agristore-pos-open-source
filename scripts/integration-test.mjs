import { spawnSync } from "node:child_process";

// This runner intentionally cannot target a hosted project or use its secrets.
if (process.env.CI !== "true" || process.platform !== "linux") {
  throw new Error("Run this test in the disposable Linux CI Supabase stack.");
}
const status = spawnSync("npx", ["supabase", "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (status.status !== 0)
  throw new Error("The disposable Supabase stack must be running.");
let local;
try {
  local = JSON.parse(status.stdout);
} catch {
  throw new Error("Local Supabase status did not return JSON.");
}
const url = local.API_URL;
if (url !== "http://127.0.0.1:55321" || !local.ANON_KEY) {
  throw new Error(
    "Integration requires the configured loopback API and public test key.",
  );
}
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
  AGRISTORE_LOCAL_INTEGRATION: "1",
};
// The web build and test process receive only the public API key. All other
// status fields, including local administrative credentials, stay unused.
for (const [command, args] of [
  ["npm", ["run", "build"]],
  ["npx", ["playwright", "test", "--config=playwright.integration.config.ts"]],
]) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
