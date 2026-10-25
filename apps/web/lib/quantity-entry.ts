import Decimal from "decimal.js";
import { canonicalQuantity, lineTotal, type Product } from "@agristore/domain";

export function enteredQuantity(raw: string): string {
  const text = raw
    .trim()
    .replace(/^¼$/, "0.25")
    .replace(/^½$/, "0.5")
    .replace(/^¾$/, "0.75");
  let value: Decimal;
  if (/^\d{1,12}\s*\/\s*\d{1,12}$/.test(text)) {
    const [top, bottom] = text.split("/");
    value = new Decimal(top.trim()).div(bottom.trim());
  } else if (/^(?:\d{1,12}(?:\.\d{1,6})?|\.\d{1,6})$/.test(text)) {
    value = new Decimal(text);
  } else {
    throw new Error("Enter a positive quantity, such as 0.5 or 1/4.");
  }
  if (
    !value.isFinite() ||
    !value.gt(0) ||
    value.decimalPlaces() > 6 ||
    value.gte("1000000000000")
  )
    throw new Error("Enter a positive quantity with up to six decimal places.");
  return value.toFixed();
}

export function kiloUnit(product: Product) {
  return product.baseUnit === "kg"
    ? product.units.find((unit) => new Decimal(unit.factor).eq(1))
    : undefined;
}

export function quantityFromDisplay(raw: string, grams: boolean) {
  const value = enteredQuantity(raw);
  return canonicalQuantity(value, grams ? "0.001" : "1");
}

export function pesoBudget(rawPesos: string): number {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(rawPesos.trim()))
    throw new Error("Enter a peso amount with at most two decimal places.");
  const budget = new Decimal(rawPesos.trim()).mul(100);
  if (!budget.gt(0) || budget.gt(Number.MAX_SAFE_INTEGER))
    throw new Error("Enter a positive peso amount within the supported range.");
  return budget.toNumber();
}

/** A conservative whole-gram estimate; the cashier must record scale weight.
 * Retail price is explicit, never inferred by dividing a sack price. */
export function estimateBudget(rawPesos: string, pricePerKilo: number) {
  const budget = new Decimal(pesoBudget(rawPesos));
  if (!Number.isSafeInteger(pricePerKilo) || pricePerKilo <= 0)
    throw new Error(
      "A positive budget and a configured kilo price are required.",
    );
  const quantity = budget
    .div(pricePerKilo)
    .toDecimalPlaces(3, Decimal.ROUND_DOWN);
  if (!quantity.gt(0))
    throw new Error(
      "This budget is below the price of one gram. Enter the actual scale weight instead.",
    );
  const kg = canonicalQuantity(quantity.toFixed(), "1");
  return {
    quantity: kg,
    grams: quantity.mul(1000).toFixed(),
    amount: lineTotal(kg, pricePerKilo),
  };
}
