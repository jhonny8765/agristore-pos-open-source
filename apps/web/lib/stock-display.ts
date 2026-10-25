import Decimal from "decimal.js";
import type { Product } from "@agristore/domain";

/** Sum all lots exactly. Bulk stock is shown in its base measure so a small
 * loose sale cannot disappear through rounding a sack equivalent. */
export function productStock(
  product: Product,
  stock: ReadonlyMap<string, string>,
) {
  const base = [...stock.entries()].reduce(
    (sum, [key, quantity]) =>
      key.startsWith(product.id + ":") ? sum.plus(quantity) : sum,
    new Decimal(0),
  );
  const unit = product.units[0];
  if (product.baseUnit === "kg" || product.baseUnit === "liter" || !unit)
    return { quantity: base.toFixed(), unit: product.baseUnit };
  const count = base.div(unit.factor);
  return count.isInteger()
    ? { quantity: count.toFixed(), unit: unit.name.toLowerCase() }
    : { quantity: base.toFixed(), unit: product.baseUnit };
}
