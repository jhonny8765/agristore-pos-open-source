import { describe, expect, it, vi } from "vitest";
import { readBrowserStorage, storageDescription } from "../../apps/web/lib/browser-storage";

describe("browser storage permission evidence", () => {
  it("only requests protection after an explicit action", async () => {
    const persist = vi.fn(async () => true);
    await readBrowserStorage({ persist, persisted: async () => false });
    expect(persist).not.toHaveBeenCalled();
    const result = await readBrowserStorage({ persist, persisted: async () => true }, true);
    expect(persist).toHaveBeenCalledTimes(1); expect(result.persistent).toBe(true);
  });
  it("does not trust an accepted request without a separate permission check", async () => {
    expect((await readBrowserStorage({ persist: async () => true, persisted: async () => false }, true)).persistent).toBe(false);
    expect((await readBrowserStorage({ persist: async () => true }, true)).persistent).toBeUndefined();
  });
  it("retains a real grant when the quota estimate fails", async () => {
    const result = await readBrowserStorage({ persisted: async () => true, estimate: async () => { throw new Error("blocked"); } });
    expect(storageDescription(result)).toContain("Persistent storage granted.");
    expect(storageDescription(result)).toContain("Usage estimate unavailable.");
  });
  it("keeps an unavailable check distinct from a denial", async () => {
    const result = await readBrowserStorage({ persisted: async () => { throw new Error("blocked"); }, estimate: async () => ({ usage: 1, quota: 1e9 }) });
    expect(result.persistent).toBeUndefined(); expect(result.quota).toBe(1e9);
    expect(storageDescription(result)).toContain("could not be verified");
    expect(storageDescription(result)).not.toContain("not granted");
  });
  it("recovers request and synchronous probe failures without failing application startup", async () => {
    const result = await readBrowserStorage({ persist: () => { throw new Error("denied"); }, persisted: () => { throw new Error("unavailable"); }, estimate: () => { throw new Error("unavailable"); } }, true);
    expect(result).toEqual({ requestFailed: true, persistent: undefined, usage: undefined, quota: undefined });
  });
  it("handles unsupported APIs without reporting an explicit denial", async () => {
    expect(storageDescription(await readBrowserStorage())).toContain("could not be verified");
  });
  it("ignores invalid estimates and detects low space", async () => {
    const invalid = await readBrowserStorage({ estimate: async () => ({ usage: -1, quota: 0 }) });
    expect(invalid.usage).toBeUndefined(); expect(invalid.quota).toBeUndefined();
    const nonFinite = await readBrowserStorage({ estimate: async () => ({ usage: NaN, quota: Infinity }) });
    expect(nonFinite.usage).toBeUndefined(); expect(nonFinite.quota).toBeUndefined();
    expect(storageDescription({ persistent: true, usage: 85e6, quota: 100e6, requestFailed: false })).toContain("Space is low.");
  });
});
