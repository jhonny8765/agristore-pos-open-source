import Dexie, { type Table } from "dexie";
import Decimal from "decimal.js";
import {
  canonicalQuantity,
  requireLease,
  saleSchema,
  stableJSON,
  type Lease,
  type Product,
  type Sale,
  type Snapshot,
  type Stock,
  type SyncAck,
} from "@agristore/domain";

export type SyncState =
  | "pending"
  | "sending"
  | "synced"
  | "authentication_required"
  | "retryable"
  | "review_required";
export interface LocalSale {
  id: string;
  payload: Sale;
  fingerprint: string;
  status: SyncState;
  attempts: number;
  nextAttempt: number;
  updatedAt: number;
  receipt?: string;
  flags?: string[];
  error?: string;
}
export const unresolvedStates: SyncState[] = ["pending", "sending", "authentication_required", "retryable", "review_required"];
interface Setting {
  key: string;
  value: unknown;
}
interface Lock {
  key: string;
  owner: string;
  expiresAt: number;
}
export class PosDatabase extends Dexie {
  products!: Table<Product, string>;
  stocks!: Table<Stock, string>;
  sales!: Table<LocalSale, string>;
  settings!: Table<Setting, string>;
  locks!: Table<Lock, string>;
  constructor(name = "agristore-live-v1") {
    super(name);
    this.version(1).stores({
      products: "id,sku,category",
      stocks: "key,productId",
      sales: "id,status,nextAttempt",
      settings: "key",
      locks: "key",
    });
    // Nested indexes preserve every v1 record without copying a lifetime of
    // payloads into memory or changing permanent transaction IDs.
    this.version(2).stores({
      sales: "id,status,nextAttempt,[payload.organizationId+payload.branchId+payload.occurredAt+id],[payload.organizationId+payload.branchId+payload.cashierId+payload.occurredAt+id],[payload.organizationId+payload.branchId+status+id],[payload.organizationId+payload.branchId+payload.cashierId+status+id],[status+id]",
    });
  }
}
export async function setting<T>(
  db: PosDatabase,
  key: string,
): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined;
}
export async function setSetting(db: PosDatabase, key: string, value: unknown) {
  await db.settings.put({ key, value });
}
export async function saveCheckout(
  db: PosDatabase,
  payload: Sale,
  now = Date.now(),
) {
  const sale = saleSchema.parse(payload);
  const fingerprint = stableJSON(sale);
  return db.transaction(
    "rw",
    [db.sales, db.settings, db.products],
    async () => {
      const previous = await db.sales.get(sale.transactionId);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new Error("This checkout ID already contains a different sale");
        return previous;
      }
      const lease = await setting<Lease>(db, "lease");
      requireLease(lease, now);
      if (
        sale.organizationId !== lease.organizationId ||
        sale.branchId !== lease.branchId ||
        sale.shiftId !== lease.shiftId ||
        sale.cashierId !== lease.cashierId ||
        sale.deviceId !== lease.deviceId
      )
        throw new Error("The checkout does not match the authorized shift");
      const asOf = await setting<string>(db, "snapshotAsOf");
      if (!asOf) throw new Error("Download the catalog online before selling");
      for (const item of sale.items) {
        const p = await db.products.get(item.productId);
        const u = p?.units.find((u) => u.id === item.unitId);
        if (
          !p?.active ||
          !u ||
          u.factor !== item.factor ||
          u.price !== item.unitPrice ||
          u.cost !== item.unitCost ||
          u.priceVersion !== item.priceVersion
        )
          throw new Error(
            "The cart has changed prices or units. Remove and add the affected product again.",
          );
        const canonical = canonicalQuantity(item.quantity, item.factor);
        if (p.baseUnit === "piece" && !new Decimal(canonical).isInteger())
          throw new Error("Piece stock must be a whole number");
        // A valid cart can remain open across Manila midnight or a catalog
        // refresh. Revalidate the lot inside the durable checkout transaction.
        const batch = p.batches.find((b) => b.id === item.batchId);
        if ((p.tracksExpiry || item.batchId !== null) && !batch)
          throw new Error("Select a current lot for this product before checkout");
        const today = new Date(now).toLocaleDateString("en-CA", {timeZone:"Asia/Manila"});
        if (batch?.expiresOn && batch.expiresOn < today)
          throw new Error("This lot has expired. Remove it from the basket and check the stock before selling.");
      }
      const record: LocalSale = {
        id: sale.transactionId,
        payload: sale,
        fingerprint,
        status: "pending",
        attempts: 0,
        nextAttempt: now,
        updatedAt: now,
      };
      await db.sales.add(record);
      // The sale is also the immutable outbox event and local stock deduction: a single durable write.
      return record;
    },
  );
}
function sameLease(a: Lease | undefined, b: Lease) {
  return !!a && a.organizationId === b.organizationId && a.branchId === b.branchId &&
    a.cashierId === b.cashierId && a.deviceId === b.deviceId && a.shiftId === b.shiftId &&
    a.issuedAt === b.issuedAt && a.expiresAt === b.expiresAt;
}
async function requireSyncContext(db: PosDatabase, lease: Lease, owner: string) {
  if (!sameLease(await setting<Lease>(db,"lease"),lease) || (await db.locks.get("sync"))?.owner !== owner)
    throw new Error("The cashier context changed in another window. Reopen the current store before synchronizing. Saved sales remain on this PC.");
}
export async function applySnapshot(db: PosDatabase, snapshot: Snapshot, syncGuard?: {lease: Lease; owner: string; syncedAt: string}) {
  await db.transaction(
    "rw",
    [db.products, db.stocks, db.sales, db.settings, db.locks],
    async () => {
      if (syncGuard) await requireSyncContext(db,syncGuard.lease,syncGuard.owner);
      if (snapshot.localRequestId && await setting(db,"snapshotRequestId") !== snapshot.localRequestId)
        throw new Error("A newer stock download or store change replaced this request. Refresh the current branch. Saved sales remain on this PC.");
      if (!snapshot.catalogUnchanged) {
        await db.products.clear();
        await db.products.bulkPut(snapshot.products);
      }
      if (snapshot.catalogVersion) await setSetting(db, "catalogVersion", snapshot.catalogVersion);
      await db.stocks.clear();
      await db.stocks.bulkPut(snapshot.stocks);
      for (const id of snapshot.confirmedIds) {
        const sale = await db.sales.get(id);
        if (sale && sale.status !== "review_required")
          await db.sales.update(id, {
            status: "synced",
            error: undefined,
            updatedAt: Date.now(),
          });
      }
      await setSetting(db, "confirmedIds", snapshot.confirmedIds);
      await setSetting(db, "snapshotAsOf", snapshot.asOf);
      if (syncGuard) await setSetting(db,"lastSync",syncGuard.syncedAt);
    },
  );
}
export async function clearAccountCache(db: PosDatabase) {
  // Account-specific caches must not cross sign-ins. Immutable sales and online
  // operation requests remain intact for the original cashier/owner to recover.
  await db.transaction(
    "rw",
    [db.products, db.stocks, db.settings],
    async () => {
      await db.products.clear();
      await db.stocks.clear();
      await db.settings.bulkDelete([
        "lease",
        "membership",
        "branches",
        "snapshotAsOf",
        "confirmedIds",
        "lastSync",
        "catalogVersion",
        "snapshotRequestId",
      ]);
    },
  );
}

export async function forgetRetiredDevice(db: PosDatabase, deviceId: string) {
  await db.transaction("rw", db.settings, async () => {
    if ((await setting<string>(db, "deviceId")) === deviceId)
      await db.settings.delete("deviceId");
    if ((await setting<Lease>(db, "lease"))?.deviceId === deviceId)
      await db.settings.delete("lease");
  });
}
export async function localStock(
  db: PosDatabase,
): Promise<Map<string, string>> {
  return db.transaction("r", [db.stocks, db.sales, db.settings], async () => {
    const result = new Map(
      (await db.stocks.toArray()).map((s) => [s.key, s.quantity]),
    );
    const confirmed = new Set(
      (await setting<string[]>(db, "confirmedIds")) ?? [],
    );
    const lease = await setting<Lease>(db, "lease");
    for (const sale of await db.sales
      .where("status")
      .anyOf(unresolvedStates)
      .toArray()) {
      if (
        sale.status === "synced" ||
        confirmed.has(sale.id) ||
        sale.payload.branchId !== lease?.branchId
      )
        continue;
      for (const item of sale.payload.items) {
        const key = stockKey(item.productId, item.batchId);
        result.set(
          key,
          new Decimal(result.get(key) ?? 0)
            .minus(canonicalQuantity(item.quantity, item.factor))
            .toFixed(),
        );
      }
    }
    return result;
  });
}
export const stockKey = (productId: string, batchId: string | null) =>
  `${productId}:${batchId ?? "none"}`;
export interface Transport {
  authorize(): Promise<boolean>;
  push(sale: Sale): Promise<SyncAck>;
  snapshot(ids: string[]): Promise<Snapshot>;
}
export async function syncOnce(
  db: PosDatabase,
  transport: Transport,
  now = Date.now(),
) {
  const owner = crypto.randomUUID();
  const locked = await db.transaction("rw", db.locks, async () => {
    const lock = await db.locks.get("sync");
    if (lock && lock.expiresAt > now) return false;
    await db.locks.put({ key: "sync", owner, expiresAt: now + 45_000 });
    return true;
  });
  if (!locked) return { sent: 0, skipped: true };
  let sent = 0;
  try {
    const lease = await setting<Lease>(db, "lease");
    if (!lease) return { sent };
    const eligible = (
      await db.sales.where("status").anyOf(unresolvedStates).toArray()
    ).filter(
      (s) =>
        s.payload.branchId === lease.branchId &&
        s.payload.organizationId === lease.organizationId &&
        s.payload.cashierId === lease.cashierId &&
        s.status !== "synced" &&
        s.status !== "review_required",
    );
    const authorized = await transport.authorize();
    await requireSyncContext(db,lease,owner);
    if (!authorized) {
      for (const s of eligible)
        await db.sales.update(s.id, {
          status: "authentication_required",
          error: "Sign in again to upload this sale",
          updatedAt: now,
        });
      return { sent };
    }
    for (const s of eligible
      .filter(
        (s) =>
          s.nextAttempt <= now &&
          (s.status !== "sending" || s.updatedAt + 45_000 < now),
      )
      .slice(0, 25)) {
      await requireSyncContext(db,lease,owner);
      await db.locks.update("sync", { expiresAt: Date.now() + 45_000 });
      await db.sales.update(s.id, { status: "sending", updatedAt: now });
      try {
        const ack = await transport.push(s.payload);
        await requireSyncContext(db,lease,owner);
        sent++;
        if (ack.transactionId !== s.id)
          throw new Error(
            "Server returned the wrong transaction acknowledgment",
          );
        if (ack.status === "review")
          await db.sales.update(s.id, {
            status: "review_required",
            error: ack.reason ?? "Owner review required",
            updatedAt: now,
          });
        else
          await db.sales.update(s.id, {
            receipt: ack.receipt,
            flags: ack.flags ?? [],
            error: undefined,
          });
        // Never mark synced until the authoritative snapshot incorporates this sale.
      } catch (error) {
        // A previous runner must not turn a sale synchronized by its successor
        // back into a retry, or write after another window has signed out.
        await requireSyncContext(db,lease,owner);
        const attempts = s.attempts + 1;
        await db.sales.update(s.id, {
          status: attempts >= 10 ? "review_required" : "retryable",
          attempts,
          nextAttempt: now + Math.min(300_000, 1000 * 2 ** attempts),
          updatedAt: now,
          error: error instanceof Error ? error.message : "Upload interrupted",
        });
      }
    }
    const ids = (await db.sales.where("status").anyOf(unresolvedStates).toArray())
      .filter(
        (s) =>
          s.payload.branchId === lease.branchId &&
          s.payload.organizationId === lease.organizationId,
      )
      .map((s) => s.id);
    await requireSyncContext(db,lease,owner);
    const snapshot = await transport.snapshot(ids);
    await applySnapshot(db, snapshot, {lease,owner,syncedAt:new Date(now).toISOString()});
    return { sent };
  } finally {
    await db.transaction("rw", db.locks, async () => {
      if ((await db.locks.get("sync"))?.owner === owner)
        await db.locks.delete("sync");
    });
  }
}
export async function retrySale(db: PosDatabase, id: string) {
  await db.sales.update(id, {
    status: "pending",
    attempts: 0,
    nextAttempt: 0,
    error: undefined,
  });
}
export interface RecoveryScope {
  organizationId: string;
  branchId: string;
  cashierId?: string;
}
function scopedSales(db: PosDatabase, scope: RecoveryScope) {
  const fields = scope.cashierId
    ? "[payload.organizationId+payload.branchId+payload.cashierId+payload.occurredAt+id]"
    : "[payload.organizationId+payload.branchId+payload.occurredAt+id]";
  const prefix = [scope.organizationId, scope.branchId, ...(scope.cashierId ? [scope.cashierId] : [])];
  return db.sales.where(fields).between([...prefix, "", ""], [...prefix, "\uffff", "\uffff"]);
}
export async function readLocalSales(db: PosDatabase, scope: RecoveryScope, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("Load between 1 and 10000 recent records");
  const [recent, unresolved, total, allPendingCount] = await Promise.all([
    scopedSales(db, scope).reverse().limit(limit).toArray(),
    db.sales.where("status").anyOf(unresolvedStates).filter(s =>
      s.payload.organizationId === scope.organizationId && s.payload.branchId === scope.branchId &&
      (!scope.cashierId || s.payload.cashierId === scope.cashierId)).toArray(),
    scopedSales(db, scope).count(),
    db.sales.where("status").anyOf(unresolvedStates).count(),
  ]);
  return { sales: [...new Map([...recent, ...unresolved].map(s => [s.id, s])).values()]
    .sort((a,b) => b.payload.occurredAt.localeCompare(a.payload.occurredAt) || b.id.localeCompare(a.id)),
    total, allPendingCount, hasOlder: total > recent.length };
}

export const recoveryOperationIds: Record<string, string> = {
  receive_stock: "receiptId", dispatch_transfer: "transferId", receive_transfer: "receiptId",
  submit_count: "countId", refund_sale: "refundId", record_stock_issue: "issueId",
  disposition_hold: "dispositionId", write_off_transfer: "receiptId",
  start_blind_count: "countId", record_blind_count: "observationId",
  approve_count: "countId", cancel_blind_count: "countId", create_branch: "newBranchId",
  assign_stock_exception: "followUpId", note_stock_exception: "followUpId",
  record_loss_cost: "costEvidenceId",
  create_purchase_order: "purchaseOrderId", purchase_order_event: "orderEventId",
  inspect_delivery: "receiptId", record_delivery_claim: "claimEventId",
};
const referenceOperations = new Set(["approve_count", "cancel_blind_count"]);
export type RecoveryActor = Pick<Lease, "organizationId" | "branchId" | "cashierId" | "role">;
const RECOVERY_PART_SIZE = 1000;
interface RecoveryArchive {
  id: string; scope?: RecoveryScope; ids: string[]; operations: unknown[]; lease?: Lease; exportedAt: string;
}
async function checksum(value: unknown) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJSON(value))))]
    .map(b => b.toString(16).padStart(2,"0")).join("");
}
export async function exportRecoveryPart(db: PosDatabase, archiveId: string, part: number, scope?: RecoveryScope) {
  const archive = await setting<RecoveryArchive>(db, `recovery:${archiveId}`);
  if (!archive || stableJSON(archive.scope ?? null) !== stableJSON(scope ?? null)) throw new Error("Recovery archive is not available for this account");
  const parts = Math.max(1, Math.ceil(archive.ids.length / RECOVERY_PART_SIZE));
  if (!Number.isInteger(part) || part < 1 || part > parts) throw new Error("Invalid recovery part");
  const records = await db.sales.bulkGet(archive.ids.slice((part-1)*RECOVERY_PART_SIZE, part*RECOVERY_PART_SIZE));
  if (records.some(s => !s)) throw new Error("A source record is unavailable. Keep earlier recovery parts and ask the owner to investigate.");
  // Hash the JSON representation actually written to disk. Optional undefined
  // fields (notably an owner's unrestricted cashier scope) disappear in JSON.
  // Do not change sale or operation fingerprints: their identities are retained.
  const body: { sales: LocalSale[]; pendingOperations: unknown[] } = JSON.parse(JSON.stringify({ sales: records, pendingOperations: part === 1 ? archive.operations : [] }));
  const manifest = { id: archive.id, part, parts, totalRecords: archive.ids.length, recordCount: records.length,
    ...(archive.scope ? { scope: JSON.parse(JSON.stringify(archive.scope)) as RecoveryScope } : {}) };
  const result = { version: 2, exportedAt: archive.exportedAt, archive: manifest,
    ...body, checksum: await checksum({archive:manifest,...body}), lease: archive.lease };
  if (part === parts) await db.settings.delete(`recovery:${archive.id}`); // IDs only; saved sales are never removed.
  return result;
}
export async function exportRecovery(db: PosDatabase, scope?: RecoveryScope) {
  const lease = await setting<Lease>(db, "lease");
  const matches = (sale: LocalSale) =>
    !scope ||
    (sale.payload.organizationId === scope.organizationId &&
      sale.payload.branchId === scope.branchId &&
      (!scope.cashierId || sale.payload.cashierId === scope.cashierId));
  // Recovery protects unresolved records. Confirmed history remains retained
  // locally and in the cloud; it must not make an emergency export unbounded.
  // Capture immutable IDs once: newly saved sales cannot slip between pages.
  const ids = (await db.sales.where("status").anyOf(unresolvedStates).filter(matches).primaryKeys()) as string[];
  const archive: RecoveryArchive = {
    id: crypto.randomUUID(), scope, ids: ids.sort(), exportedAt: new Date().toISOString(),
    operations: (
      await db.settings.where("key").startsWith("operation:").toArray()
    )
      .map((s) => s.value)
      .filter((value) => {
        if (!scope) return true;
        const op = value as {
          actorId?: string;
          data?: { organizationId?: string; branchId?: string };
        };
        return (
          op.data?.organizationId === scope.organizationId &&
          (!op.data.branchId || op.data.branchId === scope.branchId) &&
          (!scope.cashierId || op.actorId === scope.cashierId)
        );
      }),
    lease:
      !scope ||
      (lease?.organizationId === scope.organizationId &&
        lease.branchId === scope.branchId &&
        (!scope.cashierId || lease.cashierId === scope.cashierId))
        ? lease
        : undefined,
  };
  await setSetting(db, `recovery:${archive.id}`, archive);
  return exportRecoveryPart(db, archive.id, 1, scope);
}
export async function importRecovery(db: PosDatabase, input: unknown, confirmedIds: string[] = [], actor?: RecoveryActor) {
  const lease = await setting<Lease>(db, "lease");
  const data = input as {
    version?: unknown;
    sales?: unknown;
    pendingOperations?: unknown;
    checksum?: unknown;
    archive?: { id: string; part: number; parts: number; totalRecords: number; recordCount: number; scope?: RecoveryScope };
  };
  if (
    (data?.version !== 1 && data?.version !== 2) ||
    !Array.isArray(data.sales) ||
    data.sales.length > (data.version === 2 ? RECOVERY_PART_SIZE : 100000)
  )
    throw new Error("Invalid recovery file");
  // Stock staff restore online-operation evidence while all shifts stay closed.
  // A supplied signed-in context never authorizes sale recovery without a lease.
  if (data.sales.length || !actor) requireLease(lease);
  if (data.sales.length && actor && (actor.organizationId !== lease!.organizationId ||
    actor.branchId !== lease!.branchId || actor.cashierId !== lease!.cashierId))
    throw new Error("The recovery account does not match the authorized shift");
  const context = actor ?? lease!;
  if (data.version === 2 && (!data.archive || !/^[\da-f-]{36}$/i.test(data.archive.id) ||
    !Number.isInteger(data.archive.parts) || !Number.isInteger(data.archive.part) || data.archive.part < 1 ||
    data.archive.part > data.archive.parts || !Number.isSafeInteger(data.archive.totalRecords) || data.archive.totalRecords < 0 ||
    data.archive.parts !== Math.max(1,Math.ceil(data.archive.totalRecords/RECOVERY_PART_SIZE)) ||
    data.archive.recordCount !== data.sales.length ||
    data.archive.recordCount !== Math.max(0,Math.min(RECOVERY_PART_SIZE,data.archive.totalRecords-(data.archive.part-1)*RECOVERY_PART_SIZE)) ||
    data.checksum !== await checksum({ archive:data.archive,sales: data.sales, pendingOperations: data.pendingOperations ?? [] })))
    throw new Error("Recovery part is incomplete or its checksum does not match. Keep the original file.");
  if (data.archive?.scope && (data.archive.scope.organizationId !== context.organizationId ||
    data.archive.scope.branchId !== context.branchId))
    throw new Error("Recovery records belong to another business or branch");
  const normalize = (row: unknown) => {
    const payload = saleSchema.parse((row as { payload: unknown }).payload);
    if (
      payload.organizationId !== context.organizationId ||
      payload.branchId !== context.branchId
    )
      throw new Error("Recovery records belong to another business or branch");
    if (payload.cashierId !== context.cashierId && context.role !== "owner")
      throw new Error(
        "Sign in as the original cashier or ask the owner to restore this file",
      );
    return {
      payload,
      id: payload.transactionId,
      fingerprint: stableJSON(payload),
    };
  };
  // Validate the complete part/legacy file before writing, without cloning all
  // payloads. A resumable batch never destroys or overwrites an existing sale.
  const fingerprints = new Map<string,string>();
  for (const row of data.sales) {
    const record = normalize(row);
    const previous = fingerprints.get(record.id);
    if (previous && previous !== record.fingerprint) throw new Error("Recovery contains conflicting transaction IDs");
    fingerprints.set(record.id, record.fingerprint);
  }
  if (data.version === 2 && fingerprints.size !== data.sales.length) throw new Error("Recovery part contains repeated transaction IDs");
  if (data.archive) {
    const expected = {parts:data.archive.parts,totalRecords:data.archive.totalRecords,scope:data.archive.scope};
    const previous = await setting(db,`restoredArchive:${data.archive.id}`);
    if (previous && stableJSON(previous) !== stableJSON(expected)) throw new Error("Recovery parts have conflicting manifests. Keep the originals.");
  }
  const operations = Array.isArray(data.pendingOperations)
    ? data.pendingOperations
    : [];
  if (operations.length > 100) throw new Error("Too many recovery operations");
  const safeOperations = operations.map((raw) => {
    const op = raw as {
      action: string;
      data: Record<string, unknown>;
      actorId: string;
      error?: string;
    };
    const idField = op && Object.hasOwn(recoveryOperationIds,op.action) ? recoveryOperationIds[op.action] : undefined;
    if (
      !idField ||
      !op.data ||
      typeof op.actorId !== "string" ||
      typeof op.data[idField] !== "string"
    )
      throw new Error("Invalid recovery operation");
    if (
      op.data.organizationId !== context.organizationId ||
      (op.action === "create_branch" ? op.data.branchId !== undefined : op.data.branchId !== context.branchId)
    )
      throw new Error(
        "Recovery operation belongs to another business or branch",
      );
    if (op.actorId !== context.cashierId && context.role !== "owner")
      throw new Error("The owner must review another employee’s operation");
    const body = { ...op.data };
    // Approval/closure refer to an existing count; its ID remains part of the
    // request fingerprint. Generated transaction IDs are excluded, as at save.
    if (!referenceOperations.has(op.action)) delete body[idField];
    const key = `operation:${op.action}:${context.organizationId}:${op.data.branchId}`;
    return {
      key,
      value: {
        ...op,
        key,
        fingerprint: stableJSON(body),
        error: op.error ?? "Restored original request; verify before retrying",
      },
    };
  });
  const operationKeys = new Map<string,string>();
  for (const op of safeOperations) {
    const identity = stableJSON({actorId:op.value.actorId,data:op.value.data});
    if (operationKeys.has(op.key) && operationKeys.get(op.key) !== identity)
      throw new Error("Recovery contains conflicting operations. Keep the original files for owner review.");
    operationKeys.set(op.key,identity);
  }
  const verified = new Set(confirmedIds);
  const sourceRows = data.sales;
  // Legacy >10k exports remain readable. Every 1000-record transaction can be
  // retried after interruption; conflicts never replace retained records.
  for (let offset = 0; offset < Math.max(1,sourceRows.length); offset += RECOVERY_PART_SIZE) {
   await db.transaction("rw", [db.sales, db.settings], async () => {
    for (const op of safeOperations) {
      const existing = await db.settings.get(op.key);
      if (
        existing &&
        ((existing.value as { actorId: string }).actorId !== op.value.actorId ||
          stableJSON((existing.value as { data: unknown }).data) !== stableJSON(op.value.data))
      )
        throw new Error(
          "Another operation is already awaiting confirmation. Keep both recovery files.",
        );
      await db.settings.put(op);
    }
    for (const row of sourceRows.slice(offset, offset + RECOVERY_PART_SIZE)) {
      const record = normalize(row);
      const existing = await db.sales.get(record.id);
      if (existing) {
        if (existing.fingerprint !== record.fingerprint)
          throw new Error(
            "Recovery conflicts with an existing transaction. Keep both files for owner review.",
          );
        continue;
      }
      await db.sales.add({
        ...record,
        status:
          verified.has(record.id) ? "synced" : record.payload.cashierId === context.cashierId
            ? "pending"
            : "review_required",
        attempts: 0,
        nextAttempt: 0,
        updatedAt: Date.now(),
        error:
          verified.has(record.id) || record.payload.cashierId === context.cashierId
            ? undefined
            : "Restored for owner review; original cashier authentication required",
      });
    }
    if (data.archive) {
      await setSetting(db,`restoredArchive:${data.archive.id}`,{parts:data.archive.parts,totalRecords:data.archive.totalRecords,scope:data.archive.scope});
      await setSetting(db, `restored:${data.archive.id}:${data.archive.part}`, { records: sourceRows.length, importedAt: new Date().toISOString() });
    }
   });
  }
  return sourceRows.length;
}
