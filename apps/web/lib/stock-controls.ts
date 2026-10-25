import Decimal from "decimal.js";
import type { Product } from "@agristore/domain";

export function preferredBatch(product: Product, stock: Map<string,string>, today: string) {
  const available = product.batches.filter(b => (!b.expiresOn || b.expiresOn >= today) &&
    new Decimal(stock.get(`${product.id}:${b.id}`) ?? 0).gt(0))
    .sort((a,b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999") || a.lot.localeCompare(b.lot));
  if (available.length) return available[0].id;
  if (product.tracksExpiry) throw new Error("No unexpired lot has available stock in this branch. Check the physical stock and synchronize before selling.");
  return null;
}
export function outstandingTransfer(row: Record<string,unknown>) {
  return new Decimal(String(row.quantity ?? 0)).minus(String(row.received_quantity ?? 0))
    .minus(String(row.held_quantity ?? 0)).minus(String(row.lost_quantity ?? 0)).toFixed();
}
