import Decimal from "decimal.js";
import { historyCsv } from "./history";
const Exact = Decimal.clone({ precision: 80 });
export type PurchasingCursor = { at: string; id: string };
export interface OrderLine { id: string; line_no: number; product_id: string; unit_id: string; product_name: string; unit_name: string; base_unit: string; factor: string; quantity: string; base_quantity: string; accepted: string; held: string; rejected: string; returned_or_disposed: string; remaining: string }
export interface PurchaseOrder { id: string; reference: string; supplier_id: string; supplier_name: string; expected_on: string | null; reason: string; created_at: string; state: "pending" | "approve" | "close" | "cancel"; lines: OrderLine[]; events: { action: string; reason: string; created_at: string }[] }
export interface InspectionLine { id: string; line_no: number; product_id: string; unit_id: string; order_line_id: string | null; product_name: string; unit_name: string; base_unit: string; factor: string; document_quantity: string; accepted: string; held: string; rejected: string; held_remaining: string; hold_id: string | null; lot: string | null; expires_on: string | null; reason: string }
export interface DeliveryReversal { id: string; reference: string; reason: string; created_at: string; actorId: string; reopenedOrder: boolean }
export interface DeliveryInspection { id: string; reference: string; supplier_id: string; supplier_name: string; order_id: string | null; order_reference: string | null; reason: string; created_at: string; exception_id: string | null; claim_state: "open" | "resolved" | null; claim_version: number; lines: InspectionLine[]; reversal?: DeliveryReversal | null; correctsInspectionId?: string | null; correctionId?: string | null }
export interface DeliveryReversalPlan { receiptId: string; eligible: boolean; reasons: string[]; ledgerRevision: string; orderVersion: number; orderId: string | null; reopensOrder: boolean; effects: { product_id: string; batch_id: string | null; product_name: string; base_unit: string; saleable_to_remove: string; held_to_cancel: string; book_before: string; book_after: string }[] }
export interface PurchasingWorkspace { asOf: string; orders: PurchaseOrder[]; deliveries: DeliveryInspection[]; orderNext: PurchasingCursor | null; deliveryNext: PurchasingCursor | null }
export interface ClaimEvent { id: string; revision: number; outcome: string; reference: string; reason: string; created_at: string; actor_name: string | null }
export function purchaseQuantity(raw: string, positive = false) {
  if (!/^\d{1,14}(?:\.\d{1,6})?$/.test(raw.trim())) throw new Error("Enter a quantity with at most six decimal places. Enter 0 explicitly when none.");
  const value = new Exact(raw.trim()); if (positive && value.lte(0)) throw new Error("Order quantity must be greater than zero.");
  return value.toFixed();
}
export function inspectedTotals(document: string, accepted: string, held: string, rejected: string) {
  const physical = new Exact(purchaseQuantity(accepted)).plus(purchaseQuantity(held)).plus(purchaseQuantity(rejected));
  const documented = new Exact(purchaseQuantity(document));
  if (physical.plus(documented).eq(0)) throw new Error("Record documented or physically inspected goods on every delivery line.");
  return { physical: physical.toFixed(), difference: physical.minus(documented).toFixed() };
}
export function inspectionsCsv(rows: DeliveryInspection[], branch: string, asOf: string) {
  return historyCsv(["branch","asOf","delivery_id","delivery_reference","record_state","reversal_id","reversal_reference","reversal_reason","corrects_inspection_id","correction_id","supplier","order_reference","recorded_at","product_id","product_name","lot","expires_on","unit_name","factor","base_unit","document_quantity","physical","accepted","held","rejected","difference","held_remaining","claim_state","reason"].map(key => ({ label: key, value: row => row[key], numeric: ["factor","document_quantity","physical","accepted","held","rejected","difference","held_remaining"].includes(key) })),
    rows.flatMap(d => d.lines.map(l => ({ ...l, branch, asOf, delivery_id: d.id, delivery_reference: d.reference, record_state:d.reversal?"reversed":"active",reversal_id:d.reversal?.id??"",reversal_reference:d.reversal?.reference??"",reversal_reason:d.reversal?.reason??"",corrects_inspection_id:d.correctsInspectionId??"",correction_id:d.correctionId??"",supplier: d.supplier_name, order_reference: d.order_reference, recorded_at: d.created_at, claim_state: d.reversal?"Administrative reversal; no supplier settlement":d.claim_state ?? "No discrepancy", ...inspectedTotals(l.document_quantity,l.accepted,l.held,l.rejected) }))));
}
