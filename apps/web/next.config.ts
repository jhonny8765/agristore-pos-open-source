import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@agristore/domain", "@agristore/offline"],
  poweredByHeader: false,
  // Public build identity only; never include service credentials here.
  env: { NEXT_PUBLIC_APP_RELEASE: process.env.VERCEL_URL ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local-build" },
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
export default config;
