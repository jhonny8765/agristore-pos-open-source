import Decimal from "decimal.js";
import { canonicalQuantity } from "@agristore/domain";

export interface ProductSetup {
  name: string;
  sku: string;
  category: string;
  baseUnit: string;
  minimumStock: string;
  tracksExpiry: boolean;
  units: { name: string; factor: string; price: number; cost: number }[];
}

const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();

function amount(form: FormData, key: string, label: string, positive = false) {
  const raw = value(form, key);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw))
    throw new Error(`Enter ${label} in pesos, with up to two decimal places.`);
  const cents = new Decimal(raw).mul(100);
  if (cents.gt(Number.MAX_SAFE_INTEGER) || (positive && !cents.gt(0)))
    throw new Error(
      `${label} must be greater than ₱0 and within the supported range.`,
    );
  return cents.toNumber();
}

/** Only explicitly enabled selling units are created. Retail prices are independent. */
export function productSetup(form: FormData): ProductSetup {
  const name = value(form, "name"),
    sku = value(form, "sku");
  const baseUnit = value(form, "baseUnit"),
    unitName = value(form, "unit");
  if (!name || !sku || !unitName)
    throw new Error("Enter the product name, SKU and selling unit name.");
  if (!["kg", "liter", "piece"].includes(baseUnit))
    throw new Error("Choose the stock measurement.");
  const factor = canonicalQuantity(value(form, "factor"), "1");
  if (baseUnit === "piece" && !new Decimal(factor).isInteger())
    throw new Error("A pack must contain a whole number of pieces.");
  const minimumStock = value(form, "minimum") || "0";
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(minimumStock))
    throw new Error(
      "Enter a non-negative low-stock quantity with up to six decimal places.",
    );
  const units = [
    {
      name: unitName,
      factor,
      price: amount(form, "price", "the main selling price", true),
      cost: amount(form, "cost", "the main unit cost"),
    },
  ];
  if (form.get("loose") === "on") {
    if (new Decimal(factor).eq(1))
      throw new Error(
        "The main unit already uses the stock measurement. Add only one price for it.",
      );
    const retailName =
      baseUnit === "kg" ? "Kilo" : baseUnit === "liter" ? "Liter" : "Piece";
    if (unitName.toLowerCase() === retailName.toLowerCase())
      throw new Error(`Give the pack a different name from ${retailName}.`);
    units.push({
      name: retailName,
      factor: "1",
      price: amount(
        form,
        "basePrice",
        "the separate retail selling price",
        true,
      ),
      cost: amount(form, "baseCost", "the retail unit cost"),
    });
  }
  return {
    name,
    sku,
    category: value(form, "category"),
    baseUnit,
    minimumStock,
    tracksExpiry: form.get("expiry") === "on",
    units,
  };
}
