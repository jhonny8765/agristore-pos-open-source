import Decimal from "decimal.js";
import { historyCsv, type HistoryColumn } from "./history";
const CostDecimal = Decimal.clone({ precision: 80 });
export interface LossRow {
  loss_key: string; branch_id: string; branch_name: string; product_id: string; product_name: string;
  batch_id: string | null; lot: string; base_unit: string; recorded_at: string; quantity: string;
  category: string; bucket: "loss" | "other_removal"; source_id: string; reason: string; destination_branch_id: string | null;
  evidence_id: string | null; unit_name: string | null; unit_factor: string | null; unit_cost_centavos: string | null;
  value_centavos: string | null; reference: string | null; cost_reason: string | null; recorded_name: string | null;
  cost_recorded_at: string | null; zero_cost_confirmed: boolean | null;
}
export interface ReconciliationRow {
  branch_id: string; branch_name: string; product_id: string; product_name: string; batch_id: string | null; lot: string; base_unit: string;
  balance_start: string; opening: string; purchases: string; sales: string; refunds: string; transfer_in: string; transfer_out: string;
  shortage_adjustments: string; surplus_adjustments: string; write_offs: string; held_out: string; held_release: string;
  balance_end: string; held_at_end: string; in_transit_out: string;
}
export interface LossReport {
  asOf: string; fromDate: string | null; throughDate: string | null; allBranches: boolean; filter: string;
  totals: { lossRows: number; missingLossCosts: number; documentedLossCentavos: string; otherRows: number; missingOtherCosts: number; documentedOtherCentavos: string };
  rows: LossRow[]; next: { at: string; key: string } | null;
  reconciliation: ReconciliationRow[]; reconciliationNext: { branchId: string; productId: string; batchKey: string } | null;
}
export interface CostHistoryRow { id: string; unit_name: string; unit_factor: string; unit_cost_centavos: string; reference: string; reason: string; recorded_name: string; created_at: string; revision: number; zero_cost_confirmed: boolean }
export function reportMoney(centavos: string | null) {
  if (centavos === null) return "Cost not documented";
  const [whole, fraction] = new CostDecimal(centavos).div(100).toFixed(2).split(".");
  return `₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
export function purchaseCentavos(pesos: string) {
  const raw = pesos.trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw)) throw new Error("Enter a purchase cost with at most two decimal places.");
  return new Decimal(raw).mul(100).toFixed(0);
}
export function businessDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export const reconciliationQuantities = [
  ["balance_start", "Starting book quantity"], ["opening", "Opening imports"], ["purchases", "Purchases / receiving corrections"], ["sales", "Sales"], ["refunds", "Saleable returns"],
  ["transfer_in", "Transfers in"], ["transfer_out", "Transfers out"], ["shortage_adjustments", "Shortage adjustments"], ["surplus_adjustments", "Surplus adjustments"],
  ["write_offs", "Direct write-offs / use"], ["held_out", "Moved into hold / corrections"], ["held_release", "Released from hold"], ["balance_end", "Closing book quantity"],
  ["held_at_end", "Held separately at cutoff"], ["in_transit_out", "Outstanding dispatch at cutoff"],
] as const;
export function lossCsv(report: LossReport, scope: string) {
  const columns: HistoryColumn[] = [
    { label: "Branch scope", value: () => scope }, { label: "Snapshot", value: () => report.asOf }, { label: "From date (Manila)", value: () => report.fromDate }, { label: "Through date (Manila)", value: () => report.throughDate },
    ...["loss_key", "branch_id", "branch_name", "product_id", "product_name", "batch_id", "lot", "base_unit", "recorded_at", "category", "bucket", "source_id", "destination_branch_id", "reason"].map(key => ({ label: key, value: (r: Record<string, unknown>) => r[key] })),
    { label: "Missing / removed base quantity", value: r => r.quantity, numeric: true },
    { label: "Cost evidence ID", value: r => r.evidence_id }, { label: "Cost status", value: r => r.evidence_id ? "Owner documented" : "Unvalued — cost evidence missing" },
    { label: "Purchase unit", value: r => r.unit_name }, { label: "Base units per purchase unit", value: r => r.unit_factor, numeric: true },
    { label: "Purchase cost centavos per unit", value: r => r.unit_cost_centavos, numeric: true }, { label: "Value centavos (rounded per row)", value: r => r.value_centavos, numeric: true },
    { label: "Document reference", value: r => r.reference }, { label: "Cost explanation", value: r => r.cost_reason }, { label: "Recorded by", value: r => r.recorded_name }, { label: "Cost recorded at", value: r => r.cost_recorded_at },
  ];
  return historyCsv(columns, report.rows as unknown as Record<string, unknown>[]);
}
export function reconciliationCsv(report: LossReport, scope: string) {
  return historyCsv([
    { label: "Branch scope", value: () => scope }, { label: "Snapshot", value: () => report.asOf }, { label: "From date (Manila)", value: () => report.fromDate }, { label: "Through date (Manila)", value: () => report.throughDate },
    ...["branch_id", "branch_name", "product_id", "product_name", "batch_id", "lot", "base_unit"].map(key => ({ label: key, value: (r: Record<string, unknown>) => r[key] })),
    ...reconciliationQuantities.map(([key, label]) => ({ label, value: (r: Record<string, unknown>) => r[key], numeric: true })),
  ], report.reconciliation as unknown as Record<string, unknown>[]);
}
