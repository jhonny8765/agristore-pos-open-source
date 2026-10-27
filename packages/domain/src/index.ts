import Decimal from "decimal.js";
import { z } from "zod";

export const OFFLINE_HOURS = 12;
export const money = (centavos: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    centavos / 100,
  );
export const quantitySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((v) => new Decimal(v).gt(0), "Quantity must be greater than zero");
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const saleItemSchema = z
  .object({
    productId: z.uuid(),
    unitId: z.uuid(),
    batchId: z.uuid().nullable(),
    name: z.string().min(1).max(180),
    unitName: z.string().min(1).max(40),
    quantity: quantitySchema,
    factor: quantitySchema,
    unitPrice: cents,
    unitCost: cents,
    priceVersion: z.number().int().positive(),
    lineTotal: cents,
  })
  .strict();
export const saleSchema = z
  .object({
    version: z.literal(1),
    transactionId: z.uuid(),
    organizationId: z.uuid(),
    branchId: z.uuid(),
    deviceId: z.uuid(),
    cashierId: z.uuid(),
    shiftId: z.uuid(),
    occurredAt: z.iso.datetime(),
    items: z.array(saleItemSchema).min(1).max(100),
    total: cents,
    cashReceived: cents,
  })
  .strict()
  .superRefine((sale, ctx) => {
    let sum = new Decimal(0);
    for (const item of sale.items) {
      const expected = lineTotal(item.quantity, item.unitPrice);
      if (expected !== item.lineTotal)
        ctx.addIssue({
          code: "custom",
          message: "Line amount does not match quantity and price",
        });
      sum = sum.plus(item.lineTotal);
    }
    if (!sum.eq(sale.total))
      ctx.addIssue({
        code: "custom",
        message: "Sale total does not match its items",
      });
    if (sale.cashReceived < sale.total)
      ctx.addIssue({
        code: "custom",
        message: "Cash received is below the amount due",
      });
  });
export type Sale = z.infer<typeof saleSchema>;
export type SaleItem = Sale["items"][number];
export type Role = "owner" | "manager" | "cashier" | "stock_staff";
export interface Unit {
  id: string;
  name: string;
  factor: string;
  price: number;
  cost: number;
  priceVersion: number;
}
export interface Batch {
  id: string;
  lot: string;
  expiresOn: string | null;
}
export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  baseUnit: string;
  minimumStock: string;
  active: boolean;
  tracksExpiry: boolean;
  units: Unit[];
  batches: Batch[];
}
export interface Branch {
  id: string;
  name: string;
  code: string;
}
export interface Membership {
  organizationId: string;
  organizationName: string;
  branchId: string | null;
  role: Role;
  userId: string;
  name: string;
}
export interface Lease {
  organizationId: string;
  branchId: string;
  deviceId: string;
  cashierId: string;
  shiftId: string;
  issuedAt: number;
  expiresAt: number;
  name: string;
  role: Role;
  practice?: boolean;
}
export interface Stock {
  key: string;
  productId: string;
  batchId: string | null;
  quantity: string;
}
export interface Snapshot {
  products: Product[];
  stocks: Stock[];
  confirmedIds: string[];
  asOf: string;
  catalogVersion?: string;
  catalogUnchanged?: boolean;
  /** Local request fence, attached by the browser, never submitted to the server. */
  localRequestId?: string;
  /** Browser metadata: the authorized request that produced this stock snapshot. */
  localScope?: { organizationId: string; branchId: string };
}
export interface SyncAck {
  transactionId: string;
  status: "created" | "duplicate" | "review";
  receipt?: string;
  flags?: string[];
  reason?: string;
}
export function lineTotal(quantity: string, unitPrice: number): number {
  const value = new Decimal(quantity)
    .mul(unitPrice)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (
    !value.isFinite() ||
    value.isNegative() ||
    value.gt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("Amount is outside the supported range");
  return value.toNumber();
}
export function canonicalQuantity(quantity: string, factor: string): string {
  const result = new Decimal(quantitySchema.parse(quantity)).mul(
    quantitySchema.parse(factor),
  );
  if (result.decimalPlaces() > 6 || result.gte("1000000000000"))
    throw new Error("Quantity conversion exceeds supported precision");
  return result.toFixed();
}
export function total(items: Pick<SaleItem, "lineTotal">[]) {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}
export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stableJSON(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function requireLease(
  lease: Lease | undefined,
  now = Date.now(),
): asserts lease is Lease {
  if (!lease) throw new Error("Open a shift online before selling");
  if (now >= lease.expiresAt || lease.issuedAt > now + 60_000)
    throw new Error(
      "Offline authorization expired. Reconnect and renew your shift.",
    );
  if (!["cashier", "manager", "owner"].includes(lease.role))
    throw new Error("Your role cannot complete sales");
}
export function makeItem(
  product: Product,
  unitId: string,
  quantity: string,
  batchId: string | null,
  today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
): SaleItem {
  if (!product.active) throw new Error("This product is inactive");
  const unit = product.units.find((u) => u.id === unitId);
  if (!unit) throw new Error("Select a valid selling unit");
  const canonical = canonicalQuantity(quantity, unit.factor);
  if (product.baseUnit === "piece" && !new Decimal(canonical).isInteger())
    throw new Error("Piece stock must be a whole number");
  const batch = product.batches.find((b) => b.id === batchId);
  if (product.tracksExpiry && !batch)
    throw new Error("Select a batch for this product");
  if (batch?.expiresOn && batch.expiresOn < today)
    throw new Error("This batch has expired");
  return {
    productId: product.id,
    unitId,
    batchId,
    name: product.name,
    unitName: unit.name,
    quantity,
    factor: unit.factor,
    unitPrice: unit.price,
    unitCost: unit.cost,
    priceVersion: unit.priceVersion,
    lineTotal: lineTotal(quantity, unit.price),
  };
}

export * from "./refunds";

export * from "./measurements";
