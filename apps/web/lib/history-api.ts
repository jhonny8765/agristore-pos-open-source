import { supabase } from "./api";
import { recordColumns } from "./record-columns";
import {
  historyBounds,
  historySources,
  uuidPattern,
  validateHistoryCursor,
  type HistoryCursor,
  type HistoryKind,
  type HistoryRange,
  type HistoryRow,
} from "./history";

export async function historyPage(
  input: {
    kind: HistoryKind;
    organizationId: string;
    branchId: string;
    range: HistoryRange;
    before?: HistoryCursor;
  },
  client = supabase,
) {
  const { kind, organizationId, branchId, range, before } = input;
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(branchId))
    throw new Error(
      "Choose a valid business and branch before loading history.",
    );
  const source = historySources[kind];
  if (!source) throw new Error("Unknown history register.");
  const bounds = historyBounds(range);
  let query = client
    .from(source.table)
    .select(recordColumns(source.table))
    .eq("organization_id", organizationId)
    .order(source.date, { ascending: false })
    .order("id", { ascending: false });
  const conditions: string[] = [];
  if (kind === "transfers")
    conditions.push(
      `or(branch_id.eq.${branchId},destination_branch_id.eq.${branchId})`,
    );
  else if (kind === "audit")
    conditions.push(`or(branch_id.eq.${branchId},branch_id.is.null)`);
  else query = query.eq("branch_id", branchId);
  if (bounds.from) query = query.gte(source.date, bounds.from);
  if (bounds.to) query = query.lt(source.date, bounds.to);
  if (before) {
    validateHistoryCursor(kind, before);
    // Keep the database's microseconds intact rather than truncating to JS milliseconds.
    conditions.push(
      `or(${source.date}.lt.${before.at},and(${source.date}.eq.${before.at},id.lt.${before.id}))`,
    );
  }
  if (conditions.length) query = query.or(`and(${conditions.join(",")})`);
  const { data, error } = await query.limit(51);
  if (error) throw new Error(error.message);
  const result = (data ?? []).slice(0, 50) as unknown as HistoryRow[];
  const last = result.at(-1);
  return {
    rows: result,
    next:
      data && data.length > 50 && last
        ? { at: String(last[source.date]), id: String(last.id) }
        : undefined,
  };
}
