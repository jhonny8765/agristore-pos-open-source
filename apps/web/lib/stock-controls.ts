import Decimal from "decimal.js";
import type { Product } from "@agristore/domain";
import { historicalStock } from "./stock-history";

/** Server record details keep stock identity available in a stale cashier window. */
export function stockControlIdentity(products:readonly Product[],row:Record<string,unknown>){
 const cached=historicalStock(products,row);
 const text=(value:unknown)=>typeof value==="string"&&value.trim()?value:null;
 const unit=text(row.base_unit),lot=text(row.lot);
 return {
  name:text(row.product_name)??cached.name,
  lot:row.batch_id&&lot?`Lot ${lot}`:cached.lot,
  expiresOn:row.batch_id&&lot?(text(row.expires_on)??null):cached.expiresOn,
  baseUnit:unit&&["kg","liter","meter","piece"].includes(unit)?unit:cached.baseUnit,
 };
}

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
