import type { NextConfig } from "next";
import {contentSecurityPolicy} from "./lib/security-headers";
const config: NextConfig = {
  transpilePackages: ["@agristore/domain", "@agristore/offline"],
  poweredByHeader: false,
  // Public build identity only; never include service credentials here.
  env: { NEXT_PUBLIC_APP_RELEASE: process.env.NEXT_PUBLIC_APP_RELEASE ?? process.env.VERCEL_URL ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local-build" },
  compiler: {
    runAfterProductionCompile: async ({ distDir, projectDir }) => {
      const { buildOffline } = await import("./scripts/build-sw.mjs");
      await buildOffline(distDir, projectDir);
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NODE_ENV==="development") },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
// Pages serves the exported shell; the live health check is a separate Worker.
// The export runner copies this app into an isolated directory first.
if (process.env.AGRISTORE_CLOUDFLARE_BUILD === "1") {
  config.output = "export";
  delete config.headers;
}
export default config;
