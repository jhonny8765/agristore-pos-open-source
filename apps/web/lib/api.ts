import { createClient } from "@supabase/supabase-js";
import type {
  Branch,
  Lease,
  Membership,
  Sale,
  Snapshot,
  SyncAck,
} from "@agristore/domain";
import { setting, setSetting, type PosDatabase, type Transport } from "@agristore/offline";
import { recordColumns } from "./record-columns";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:55321",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "local-development-placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(15000),
        }),
    },
  },
);
export async function command<T = Record<string, unknown>>(
  action: string,
  data: Record<string, unknown>,
): Promise<T> {
  if (!navigator.onLine)
    throw new Error(
      "Reconnect to use this action. Completed cash sales remain on this PC.",
    );
  const { data: result, error } = await supabase.rpc("agri_command", {
    action,
    data,
  });
  if (error)
    throw Object.assign(new Error(error.message), { code: error.code });
  return result as T;
}
export async function memberships(): Promise<Membership[]> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user)
    throw new Error(
      "Could not verify your store access. Reconnect and try again, or sign out and sign in again. Saved sales remain on this PC.",
    );
  const { data, error: queryError } = await supabase
    .from("staff_memberships")
    .select("*,organizations(name)")
    .eq("user_id", user.id)
    .eq("active", true);
  if (queryError) throw new Error(queryError.message);
  return (data ?? []).map((m) => ({
    organizationId: m.organization_id,
    organizationName:
      (m.organizations as { name: string })?.name ?? "AgriStore",
    branchId: m.branch_id,
    role: m.role,
    userId: m.user_id,
    name: m.name,
  }));
}
export async function branches(org: string): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id,name,code")
    .eq("organization_id", org)
    .order("code");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function requestSnapshot(db: PosDatabase | undefined, input: Record<string, unknown>): Promise<Snapshot> {
  const localRequestId = db ? crypto.randomUUID() : undefined;
  let catalogVersion = db ? await db.transaction("rw",db.settings,async()=>{
    await setSetting(db,"snapshotRequestId",localRequestId);
    return setting<string>(db,"catalogVersion");
  }) : undefined;
  const ids = Array.isArray(input.transactionIds) ? input.transactionIds : [];
  const confirmed = new Set<string>();
  let fullCatalog: Snapshot["products"] | undefined;
  let latest: Snapshot | undefined;
  // All earlier acknowledgments are included in the final, later stock snapshot:
  // completed sales are immutable. Never submit a lifetime-sized RPC body.
  for (let offset = 0; offset < Math.max(1,ids.length); offset += 1000) {
    latest = await command<Snapshot>("snapshot", { ...input, transactionIds: ids.slice(offset,offset+1000), ...(catalogVersion ? {catalogVersion} : {}) });
    latest.confirmedIds.forEach(id => confirmed.add(id));
    if (!latest.catalogUnchanged) fullCatalog = latest.products;
    catalogVersion = latest.catalogVersion;
  }
  return {...latest!, confirmedIds:[...confirmed], products:fullCatalog ?? [], catalogUnchanged:fullCatalog === undefined, ...(localRequestId ? {localRequestId} : {})};
}
export function cloudTransport(lease: Lease, db?: PosDatabase): Transport {
  const context = {
    organizationId: lease.organizationId,
    branchId: lease.branchId,
    deviceId: lease.deviceId,
  };
  return {
    async authorize() {
      if (!navigator.onLine) return false;
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || user?.id !== lease.cashierId) return false;
      try {
        return (
          await command<{ authorized: boolean }>("authorize_shift", context)
        ).authorized;
      } catch (e) {
        if ((e as { code?: string }).code === "42501") return false;
        throw e;
      }
    },
    push: async (sale: Sale) => {
      try {
        return await command<SyncAck>(
          "record_sale",
          sale as unknown as Record<string, unknown>,
        );
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code && /^(P0001|22|23)/.test(code))
          return {
            transactionId: sale.transactionId,
            status: "review",
            reason: e instanceof Error ? e.message : "Owner review required",
          };
        throw e;
      }
    },
    snapshot: (transactionIds: string[]) =>
      requestSnapshot(db, { ...context, transactionIds }),
  };
}
export async function rows(table: string, org: string, branch?: string, client = supabase) {
  let query = client.from(table).select(recordColumns(table)).eq("organization_id", org);
  if (branch) query = query.eq("branch_id", branch);
  const dateColumn = ["sales"].includes(table)
    ? "occurred_at"
    : ["cashier_shifts"].includes(table)
      ? "opened_at"
      : ["stock_transfers"].includes(table)
        ? "dispatched_at"
        : ["devices", "staff_memberships", "suppliers"].includes(table)
          ? "id"
          : "created_at";
  const { data, error } = await query
    .order(dateColumn, { ascending: false })
    .order("id", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export interface SalesCursor {
  occurredAt: string;
  id: string;
}
export async function salesPage(
  org: string,
  branch: string,
  before?: SalesCursor,
  client = supabase,
) {
  let query = client
    .from("sales")
    .select("*,sale_reversals(id),sale_partial_refunds(id)")
    .limit(1,{referencedTable:"sale_partial_refunds"})
    .eq("organization_id", org)
    .eq("branch_id", branch)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
  if (before) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        before.id,
      ) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        before.occurredAt,
      ) ||
      !Number.isFinite(Date.parse(before.occurredAt))
    )
      throw new Error("Invalid receipt history cursor. Refresh the list.");
    // Preserve PostgreSQL microseconds; Date.toISOString() would truncate the
    // cursor and could skip receipts sharing the same millisecond.
    const date = before.occurredAt;
    query = query.or(
      `occurred_at.lt.${date},and(occurred_at.eq.${date},id.lt.${before.id})`,
    );
  }
  const { data, error } = await query.limit(51);
  if (error) throw new Error(error.message);
  const result = (data ?? []).slice(0, 50) as Record<string, unknown>[];
  const last = result.at(-1);
  return {
    rows: result,
    next:
      data && data.length > 50 && last
        ? { occurredAt: String(last.occurred_at), id: String(last.id) }
        : undefined,
  };
}
