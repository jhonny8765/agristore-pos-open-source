import type { Product } from "@agristore/domain";
import type { HistoryColumn, HistoryRow } from "./history";

/** Resolve within this product: a missing catalog entry must never borrow
 * another product's lot or silently appear to be stock without a batch. */
export function historicalStock(products: readonly Product[], row: HistoryRow) {
  const product = products.find((p) => p.id === row.product_id);
  const batch = product?.batches.find((b) => b.id === row.batch_id);
  return {
    name: product?.name ?? `Product ${String(row.product_id ?? "unavailable")}`,
    lot: batch
      ? `Lot ${batch.lot}`
      : row.batch_id
        ? `Batch ${String(row.batch_id)} (details unavailable)`
        : "No lot recorded",
    expiresOn: batch?.expiresOn ?? null,
    baseUnit: product?.baseUnit ?? "",
  };
}

export function stockHistoryColumns(products: readonly Product[]): HistoryColumn[] {
  return [
    { label: "Product", value: (r) => historicalStock(products, r).name },
    { label: "Product ID", value: (r) => r.product_id },
    { label: "Batch ID", value: (r) => r.batch_id },
    { label: "Lot", value: (r) => historicalStock(products, r).lot },
    { label: "Expiry date", value: (r) => historicalStock(products, r).expiresOn },
    { label: "Base unit", value: (r) => historicalStock(products, r).baseUnit || "Unavailable" },
  ];
}
