import { generateSW } from "workbox-build";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export async function buildOffline(distDir, projectDir) {
  await mkdir(path.join(projectDir, "public"), { recursive: true });
  const revision = createHash("sha256")
    .update(String(Date.now()))
    .digest("hex");
  const result = await generateSW({
    globDirectory: path.join(distDir, "static"),
    globPatterns: ["**/*.{js,css,woff2,png,svg,webp}"],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    modifyURLPrefix: { "": "/_next/static/" },
    swDest: path.join(projectDir, "public", "sw.js"),
    cacheId: "agristore-pos-v1",
    additionalManifestEntries: [
      { url: "/", revision },
      ...(await Promise.all(
        [
          "icon.svg",
          "icon-192.png",
          "icon-512.png",
          "manifest.webmanifest",
        ].map(async (name) => ({
          url: "/" + name,
          revision: createHash("sha256")
            .update(await readFile(path.join(projectDir, "public", name)))
            .digest("hex"),
        })),
      )),
    ],
    navigateFallback: "/",
    navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
    cleanupOutdatedCaches: true,
    skipWaiting: false,
    clientsClaim: false,
    disableDevLogs: true,
    sourcemap: false,
  });
  if (result.warnings.length) throw new Error(result.warnings.join("\n"));
  console.log(
    `Offline shell built: ${result.count} files, ${Math.round(result.size / 1024)} KB`,
  );
}
