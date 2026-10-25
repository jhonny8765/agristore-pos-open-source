export type HistoryKind = "purchases" | "transfers" | "counts" | "audit";
export type HistoryRow = Record<string, unknown>;
export interface HistoryCursor {
  at: string;
  id: string;
}
export interface HistoryRange {
  from: string;
  to: string;
}
export interface HistoryColumn {
  label: string;
  value: (row: HistoryRow) => unknown;
  numeric?: boolean;
}
export const historySources = {
  purchases: { table: "purchase_receipts", date: "created_at" },
  transfers: { table: "stock_transfers", date: "dispatched_at" },
  counts: { table: "stock_counts", date: "created_at" },
  audit: { table: "audit_events", date: "created_at" },
} as const;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function midnight(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("Enter a valid calendar date.");
  const utc = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== day)
    throw new Error("Enter a valid calendar date.");
  return utc.getTime() - 8 * 60 * 60 * 1000;
}
export function historyBounds(range: HistoryRange) {
  const from = range.from ? midnight(range.from) : undefined;
  const to = range.to ? midnight(range.to) + 24 * 60 * 60 * 1000 : undefined;
  if (from !== undefined && to !== undefined && from >= to)
    throw new Error("The end date must be on or after the start date.");
  return {
    from: from === undefined ? undefined : new Date(from).toISOString(),
    to: to === undefined ? undefined : new Date(to).toISOString(),
  };
}
export function validateHistoryCursor(
  kind: HistoryKind,
  cursor: HistoryCursor,
) {
  const validId =
    kind === "audit"
      ? /^[1-9]\d*$/.test(cursor.id)
      : uuidPattern.test(cursor.id);
  if (
    !validId ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      cursor.at,
    ) ||
    !Number.isFinite(Date.parse(cursor.at))
  )
    throw new Error("Invalid history position. Refresh the register.");
}
function csvCell(value: unknown, numeric = false) {
  let text = value == null ? "" : String(value);
  // Spreadsheet programs can execute formula-like text, including after whitespace.
  // Only explicitly numeric columns may retain an exact signed decimal string.
  const decimal = numeric && /^-?\d+(?:\.\d+)?$/.test(text);
  if (typeof value === "string" && !decimal && /^[\s]*[=+\-@]/.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function historyCsv(columns: HistoryColumn[], rows: HistoryRow[]) {
  return (
    "\uFEFF" +
    [
      columns.map((c) => csvCell(c.label)).join(","),
      ...rows.map((row) => columns.map((c) => csvCell(c.value(row), c.numeric)).join(",")),
    ].join("\r\n")
  );
}
