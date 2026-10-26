export interface Investigation {
  id: string; kind: string; source_id: string; details: Record<string, unknown>;
  created_at: string; assigned_user_id: string | null; assigned_to: string;
  assignee_active: boolean; due_on: string | null; assignment_note: string | null;
  progress_note: string | null; progress_at: string | null; follow_up_version: number;
}
export interface ExpiryRow {
  product_id: string; batch_id: string | null; product_name: string; sku: string;
  base_unit: string; lot: string; expires_on: string | null; saleable: string; held: string;
  days_left: number | null; status: "missing" | "expired" | "today" | "soon";
}
export interface FollowUps {
  today: string; asOf: string;
  totals: { open: number; overdue: number; dueToday: number; unassigned: number };
  expiryTotals: { expired: number; today: number; soon: number; missing: number };
  staff: { userId: string; name: string; role: string }[];
  cases: Investigation[]; expiry: ExpiryRow[];
  next: { createdAt: string; id: string } | null;
  expiryNext: { date: string; productId: string; batchKey: string } | null;
}
export function investigationDue(row: Pick<Investigation, "due_on">, today: string) {
  return !row.due_on ? "No due date" : row.due_on < today ? `Overdue · ${row.due_on}` : row.due_on === today ? `Due today · ${row.due_on}` : `Due ${row.due_on}`;
}
export function expiryStatus(row: Pick<ExpiryRow, "status" | "days_left">) {
  return row.status === "missing" ? "Expiry missing — inspect label" : row.status === "expired" ? `Expired ${Math.abs(row.days_left!)} day(s) ago` : row.status === "today" ? "Expires today" : `Expires in ${row.days_left} day(s)`;
}
