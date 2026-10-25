import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PosDatabase,
  applySnapshot,
  clearAccountCache,
  forgetRetiredDevice,
  exportRecovery,
  importRecovery,
  localStock,
  retrySale,
  saveCheckout,
  setSetting,
  setting,
  syncOnce,
  type Transport,
} from "@agristore/offline";
import type { Sale, Snapshot } from "@agristore/domain";
import { lease, product, sale, setupDB, uuid } from "./fixtures";
const opened: PosDatabase[] = [];
async function db() {
  const d = await setupDB();
  opened.push(d);
  return d;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of opened.splice(0)) {
    d.close();
    await d.delete();
  }
});
describe("account and retired-device cache boundaries", () => {
  it("removes private account caches while preserving unresolved sales, operations and PC identity", async () => {
    const d = await db();
    const original = await saveCheckout(d, sale());
    await setSetting(d, "deviceId", uuid(3));
    await setSetting(d, "membership", { name: "Previous cashier" });
    await setSetting(d, "branches", [{ name: "Private branch" }]);
    await setSetting(d, "operation:receive_stock:retained", {
      action: "receive_stock",
      data: { receiptId: uuid(700) },
    });
    await clearAccountCache(d);
    expect(await d.products.count()).toBe(0);
    expect(await d.stocks.count()).toBe(0);
    expect(await setting(d, "membership")).toBeUndefined();
    expect(await setting(d, "branches")).toBeUndefined();
    expect(await setting(d, "lease")).toBeUndefined();
    expect(await setting(d, "snapshotAsOf")).toBeUndefined();
    expect(await setting(d, "deviceId")).toBe(uuid(3));
    expect(await d.sales.get(original.id)).toEqual(original);
    expect(await setting(d, "operation:receive_stock:retained")).toEqual({
      action: "receive_stock",
      data: { receiptId: uuid(700) },
    });
  });
  it("releases only the retired PC identity and keeps its unresolved records", async () => {
    const d = await db();
    const original = await saveCheckout(d, sale());
    await setSetting(d, "deviceId", uuid(3));
    await forgetRetiredDevice(d, uuid(900));
    expect(await setting(d, "deviceId")).toBe(uuid(3));
    expect(await setting(d, "lease")).toBeDefined();
    await forgetRetiredDevice(d, uuid(3));
    expect(await setting(d, "deviceId")).toBeUndefined();
    expect(await setting(d, "lease")).toBeUndefined();
    expect(await d.sales.get(original.id)).toEqual(original);
    expect(await d.products.count()).toBe(1);
  });
  it("exports only the selected business, branch and authorized cashier without deleting others", async () => {
    const d = await db();
    const own = await saveCheckout(d, sale());
    const other = sale({
      organizationId: uuid(90),
      branchId: uuid(91),
      cashierId: uuid(92),
    });
    await d.sales.add({ ...own, id: other.transactionId, payload: other });
    await setSetting(d, "operation:own", {
      actorId: uuid(4),
      data: { organizationId: uuid(1), branchId: uuid(2) },
    });
    await setSetting(d, "operation:other", {
      actorId: uuid(92),
      data: { organizationId: uuid(90), branchId: uuid(91) },
    });
    const backup = await exportRecovery(d, {
      organizationId: uuid(1),
      branchId: uuid(2),
      cashierId: uuid(4),
    });
    expect(backup.sales.map((row) => row.id)).toEqual([own.id]);
    expect(backup.pendingOperations).toHaveLength(1);
    expect(backup.lease?.cashierId).toBe(uuid(4));
    const otherBackup = await exportRecovery(d, {
      organizationId: uuid(90),
      branchId: uuid(91),
      cashierId: uuid(92),
    });
    expect(otherBackup.sales.map((row) => row.id)).toEqual([
      other.transactionId,
    ]);
    expect(otherBackup.lease).toBeUndefined();
    expect(await d.sales.count()).toBe(2);
  });
});
function server() {
  const saved = new Map<string, Sale>();
  let lost = false;
  const t: Transport = {
    authorize: async () => true,
    push: async (s) => {
      const duplicate = saved.has(s.transactionId);
      saved.set(s.transactionId, s);
      if (lost) {
        lost = false;
        throw new Error("response lost after commit");
      }
      return {
        transactionId: s.transactionId,
        status: duplicate ? "duplicate" : "created",
        receipt: "TEST-" + s.transactionId.slice(0, 8),
      };
    },
    snapshot: async (ids) => ({
      products: [product],
      stocks: [
        {
          key: product.id + ":none",
          productId: product.id,
          batchId: null,
          quantity: String(500 - saved.size),
        },
      ],
      confirmedIds: ids.filter((id) => saved.has(id)),
      asOf: new Date().toISOString(),
    }),
  };
  return {
    saved,
    t,
    loseResponse: () => {
      lost = true;
    },
  };
}
describe("durable offline checkout and synchronization", () => {
  it("restores sale IDs and ambiguous online operations from a recovery file", async () => {
    const source = await db(),
      target = await db();
    const s = sale();
    await saveCheckout(source, s);
    const key = `operation:receive_stock:${uuid(1)}:${uuid(2)}`;
    await setSetting(source, key, {
      key,
      action: "receive_stock",
      actorId: uuid(4),
      data: {
        organizationId: uuid(1),
        branchId: uuid(2),
        receiptId: uuid(91),
        items: [],
      },
    });
    const file = await exportRecovery(source);
    await importRecovery(target, file);
    await importRecovery(target, file);
    expect(await target.sales.count()).toBe(1);
    expect((await target.sales.get(s.transactionId))?.payload).toEqual(s);
    expect(await target.settings.get(key)).toBeDefined();
  });
  it("rejects recovery files from another branch without importing partial records", async () => {
    const d = await db();
    await expect(
      importRecovery(d, {
        version: 1,
        sales: [{ payload: sale({ branchId: uuid(99) }) }],
      }),
    ).rejects.toThrow("another business or branch");
    expect(await d.sales.count()).toBe(0);
  });
  it("atomically stores a cash sale and its local stock deduction", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    expect(await d.sales.count()).toBe(1);
    expect((await localStock(d)).get(product.id + ":none")).toBe("499");
    expect((await d.sales.get(s.transactionId))?.payload.cashReceived).toBe(
      5000,
    );
  });
  it("deduplicates the same checkout attempt, including concurrent submits", async () => {
    const d = await db();
    const s = sale();
    await Promise.all([saveCheckout(d, s), saveCheckout(d, s)]);
    expect(await d.sales.count()).toBe(1);
  });
  it("keeps separate identical purchases distinct", async () => {
    const d = await db();
    await saveCheckout(d, sale());
    await saveCheckout(d, sale());
    expect(await d.sales.count()).toBe(2);
    expect((await localStock(d)).get(product.id + ":none")).toBe("498");
  });
  it("rejects mutated content for an existing transaction ID", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    await expect(saveCheckout(d, { ...s, cashReceived: 6000 })).rejects.toThrow(
      "different sale",
    );
    expect((await d.sales.get(s.transactionId))?.payload.cashReceived).toBe(
      5000,
    );
  });
  it("blocks branch, cashier, device, and shift mismatches", async () => {
    const d = await db();
    for (const key of ["branchId", "cashierId", "deviceId", "shiftId"] as const)
      await expect(saveCheckout(d, sale({ [key]: uuid(999) }))).rejects.toThrow(
        "authorized shift",
      );
    expect(await d.sales.count()).toBe(0);
  });
  it("blocks expired authorization without destroying earlier sales", async () => {
    const d = await db();
    await saveCheckout(d, sale());
    await setSetting(d, "lease", { ...lease(), expiresAt: Date.now() - 1 });
    await expect(saveCheckout(d, sale())).rejects.toThrow("expired");
    expect(await d.sales.count()).toBe(1);
  });
  it("requires a downloaded catalog and matches its price version", async () => {
    const d = await db();
    await d.settings.delete("snapshotAsOf");
    await expect(saveCheckout(d, sale())).rejects.toThrow("catalog");
  });
  it("does not report success when durable storage fails", async () => {
    const d = await db();
    vi.spyOn(d.sales, "add").mockRejectedValueOnce(
      new DOMException("Quota exceeded", "QuotaExceededError"),
    );
    await expect(saveCheckout(d, sale())).rejects.toThrow();
    expect(await d.sales.count()).toBe(0);
    expect((await localStock(d)).get(product.id + ":none")).toBe("500");
  });
  it("recovers records after closing and reopening IndexedDB", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    const name = d.name;
    d.close();
    const reopened = new PosDatabase(name);
    opened.push(reopened);
    expect((await reopened.sales.get(s.transactionId))?.payload).toEqual(s);
    expect((await localStock(reopened)).get(product.id + ":none")).toBe("499");
  });
  it("keeps local stock unchanged when acknowledgment arrives before its snapshot", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    const srv = server();
    srv.t.snapshot = async () => {
      throw new Error("snapshot unavailable");
    };
    await expect(syncOnce(d, srv.t)).rejects.toThrow();
    expect((await d.sales.get(s.transactionId))?.status).toBe("sending");
    expect((await localStock(d)).get(product.id + ":none")).toBe("499");
  });
  it("recovers a lost server response without duplicates or double stock deduction", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    const srv = server();
    srv.loseResponse();
    await syncOnce(d, srv.t);
    await syncOnce(d, srv.t, Date.now() + 60_000);
    expect(srv.saved.size).toBe(1);
    expect((await d.sales.get(s.transactionId))?.status).toBe("synced");
    expect((await localStock(d)).get(product.id + ":none")).toBe("499");
  });
  it("keeps authentication failures visible and resumes after sign-in", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    const srv = server();
    srv.t.authorize = async () => false;
    await syncOnce(d, srv.t);
    expect((await d.sales.get(s.transactionId))?.status).toBe(
      "authentication_required",
    );
    srv.t.authorize = async () => true;
    await syncOnce(d, srv.t);
    expect((await d.sales.get(s.transactionId))?.status).toBe("synced");
  });
  it("retains review-required conflicts and permits retrying the original ID", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    const srv = server();
    srv.t.push = async (p) => ({
      transactionId: p.transactionId,
      status: "review",
      reason: "payload conflict",
    });
    await syncOnce(d, srv.t);
    expect((await d.sales.get(s.transactionId))?.status).toBe(
      "review_required",
    );
    await retrySale(d, s.transactionId);
    expect((await d.sales.get(s.transactionId))?.payload).toEqual(s);
  });
  it("reclaims an interrupted upload after its sending lease expires", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    await d.sales.update(s.transactionId, {
      status: "sending",
      updatedAt: Date.now() - 60_000,
    });
    const srv = server();
    await syncOnce(d, srv.t);
    expect(srv.saved.size).toBe(1);
  });
  it("serializes sync runners across tabs", async () => {
    const d = await db();
    await saveCheckout(d, sale());
    const srv = server();
    const results = await Promise.all([syncOnce(d, srv.t), syncOnce(d, srv.t)]);
    expect(results.some((r) => "skipped" in r && r.skipped)).toBe(true);
    expect(srv.saved.size).toBe(1);
  });
  it("keeps 200 transactions through a simulated 8-hour outage and synchronizes once each", async () => {
    const d = await db();
    for (let i = 0; i < 200; i++) await saveCheckout(d, sale());
    const future = Date.now() + 8 * 3600_000;
    expect(
      (await setting<ReturnType<typeof lease>>(d, "lease"))!.expiresAt,
    ).toBeGreaterThan(future);
    const srv = server();
    for (let i = 0; i < 8; i++) await syncOnce(d, srv.t, future + i);
    expect(srv.saved.size).toBe(200);
    expect((await d.sales.toArray()).every((s) => s.status === "synced")).toBe(
      true,
    );
    expect((await localStock(d)).get(product.id + ":none")).toBe("300");
    for (let i = 0; i < 3; i++) await syncOnce(d, srv.t, future + 100 + i);
    expect(srv.saved.size).toBe(200);
  });
  it("replaces snapshot and confirmed IDs atomically without clearing sale history", async () => {
    const d = await db();
    const s = sale();
    await saveCheckout(d, s);
    const snapshot: Snapshot = {
      products: [product],
      stocks: [
        {
          key: product.id + ":none",
          productId: product.id,
          batchId: null,
          quantity: "499",
        },
      ],
      confirmedIds: [s.transactionId],
      asOf: new Date().toISOString(),
    };
    await applySnapshot(d, snapshot);
    expect(await d.sales.count()).toBe(1);
    expect((await localStock(d)).get(product.id + ":none")).toBe("499");
  });
});
