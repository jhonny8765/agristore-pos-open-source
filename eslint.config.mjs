import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    "**/.next/**",
    "**/public/sw.js",
    "**/public/workbox-*.js",
    "**/public/offline.html",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".impeccable/review/**",
    "cloudflare-output/**",
    ".cloudflare-build-*/**",
    ".wrangler/**",
  ]),
  {
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
]);
