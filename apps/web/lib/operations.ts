import { stableJSON } from "@agristore/domain";
import { PosDatabase, setting, setSetting } from "@agristore/offline";
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
  const pending = await db.transaction("rw", db.settings, async () => {
    const previous = await setting<PendingOperation>(db, key);
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.actorId !== actorId)
        throw new Error(
          "An earlier operation needs confirmation. Retry its original request in the Sync center first.",
        );
      return previous;
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
) {
  await db.transaction("rw", db.settings, async () => {
    const current = await setting<PendingOperation>(db, pending.key);
    // A different window may have confirmed this request and started another.
    // A late response must never replace, erase or resurrect either request.
    if (!current || current.actorId !== pending.actorId ||
      current.action !== pending.action || stableJSON(current.data) !== stableJSON(pending.data)) return;
    if (error === undefined) await db.settings.delete(pending.key);
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
    const result = await command(pending.action, pending.data);
    await settleOperation(db, pending);
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
