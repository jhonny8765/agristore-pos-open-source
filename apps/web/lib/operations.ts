import { stableJSON, type Lease } from "@agristore/domain";
import { PosDatabase, setting, setSetting, unresolvedStates } from "@agristore/offline";
import { command } from "./api";
import { isDatabaseRejection } from "./command-error";
export interface PendingOperation {
  key: string;
  action: string;
  data: Record<string, unknown>;
  fingerprint: string;
  actorId: string;
  error?: string;
}
export async function requireNoPendingClosure(db: PosDatabase, organizationId: string, branchId: string) {
  if (await setting(db, `operation:close_shift:${organizationId}:${branchId}`))
    throw new Error("Shift closing is awaiting confirmation. Open Sync center and retry the original closing request before selling, opening or renewing a shift, or making another change.");
}
async function requireClosureReady(db: PosDatabase, data: Record<string, unknown>, key: string) {
  if (await db.sales.where("status").anyOf(unresolvedStates).filter(s =>
    s.payload.organizationId === data.organizationId && s.payload.branchId === data.branchId).count())
    throw new Error("Synchronize every saved sale for this branch before closing the shift. Original records remain on this PC.");
  if (await db.settings.where("key").startsWith("operation:").filter(row => {
    const op = row.value as PendingOperation;
    return row.key !== key && op.data.organizationId === data.organizationId &&
      (!op.data.branchId || op.data.branchId === data.branchId);
  }).count()) throw new Error("Confirm every stock or refund request for this branch in Sync center before closing the shift. Retry original requests; do not enter them again.");
}
export async function onlineOperation(
  db: PosDatabase,
  actorId: string,
  action: string,
  data: Record<string, unknown>,
  idField?: string,
) {
  const key = `operation:${action}:${data.organizationId}:${data.branchId}`;
  const fingerprint = stableJSON(data);
  // IndexedDB serializes this read/write transaction across browser windows.
  // Network activity must stay outside it so the durable request commits first.
  const pending = await db.transaction("rw", [db.settings, db.sales], async () => {
    const previous = await setting<PendingOperation>(db, key);
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.actorId !== actorId)
        throw new Error(
          "An earlier operation needs confirmation. Retry its original request in the Sync center first.",
        );
      return previous;
    }
    if (action === "close_shift") {
      const lease = await setting<Lease>(db, "lease");
      if (!lease || lease.organizationId !== data.organizationId || lease.branchId !== data.branchId ||
        lease.cashierId !== actorId || lease.shiftId !== data.shiftId)
        throw new Error("The saved shift changed. Refresh this store before closing; keep the original records.");
      if (!Number.isSafeInteger(data.countedCash) || Number(data.countedCash) < 0)
        throw new Error("Enter the counted drawer cash in valid centavos.");
      await requireClosureReady(db, data, key);
    } else if (typeof data.organizationId === "string" && typeof data.branchId === "string") {
      await requireNoPendingClosure(db, data.organizationId, data.branchId);
    }
    const created: PendingOperation = {
      key, action, data: idField ? { ...data, [idField]: crypto.randomUUID() } : { ...data },
      fingerprint, actorId,
    };
    await setSetting(db, key, created);
    return created;
  });
  return retryOperation(db, actorId, pending);
}
async function settleOperation(
  db: PosDatabase,
  pending: PendingOperation,
  error?: string,
  confirmed = false,
) {
  await db.transaction("rw", db.settings, async () => {
    const current = await setting<PendingOperation>(db, pending.key);
    // A different window may have confirmed this request and started another.
    // A late response must never replace, erase or resurrect either request.
    if (!current || current.actorId !== pending.actorId ||
      current.action !== pending.action || stableJSON(current.data) !== stableJSON(pending.data)) return;
    if (error === undefined) {
      if (confirmed && pending.action === "close_shift") {
        const lease = await setting<Lease>(db, "lease");
        // A late close response must never clear a newer cashier's shift.
        if (lease && lease.organizationId === pending.data.organizationId && lease.branchId === pending.data.branchId &&
          lease.shiftId === pending.data.shiftId && lease.cashierId === pending.actorId)
          await db.settings.delete("lease");
      }
      await db.settings.delete(pending.key);
    }
    else await setSetting(db, pending.key, { ...current, error });
  });
}
export async function retryOperation(
  db: PosDatabase,
  actorId: string,
  pending: PendingOperation,
) {
  if (pending.actorId !== actorId)
    throw new Error(
      "Sign in as the employee who began this operation to retry it.",
    );
  try {
    if (pending.action === "close_shift")
      await db.transaction("r", [db.sales, db.settings], () => requireClosureReady(db, pending.data, pending.key));
    const result = await command(pending.action, pending.data);
    await settleOperation(db, pending, undefined, true);
    return result;
  } catch (e) {
    // A database rejection is an authoritative rollback. An interrupted response is ambiguous and retained.
    if (isDatabaseRejection(e))
      await settleOperation(db, pending);
    else
      await settleOperation(db, pending,
        e instanceof Error ? e.message : "Response interrupted");
    throw e;
  }
}
export async function pendingOperations(db: PosDatabase) {
  return (
    await db.settings.where("key").startsWith("operation:").toArray()
  ).map((s) => s.value as PendingOperation);
}
