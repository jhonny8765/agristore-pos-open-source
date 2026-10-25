import {
  type Lease,
  type Product,
  type Sale,
  makeItem,
} from "@agristore/domain";
import { PosDatabase, applySnapshot, setSetting } from "@agristore/offline";
export const uuid = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const product: Product = {
  id: uuid(10),
  name: "Grower feeds",
  sku: "FEED-01",
  category: "Feeds",
  baseUnit: "kg",
  minimumStock: "10",
  tracksExpiry: false,
  active: true,
  batches: [],
  units: [
    {
      id: uuid(11),
      name: "Sack",
      factor: "50",
      price: 150000,
      cost: 120000,
      priceVersion: 1,
    },
    {
      id: uuid(12),
      name: "Kilo",
      factor: "1",
      price: 3200,
      cost: 2400,
      priceVersion: 1,
    },
  ],
};
export function lease(now = Date.now()): Lease {
  return {
    organizationId: uuid(1),
    branchId: uuid(2),
    deviceId: uuid(3),
    cashierId: uuid(4),
    shiftId: uuid(5),
    issuedAt: now - 1000,
    expiresAt: now + 12 * 3600_000,
    name: "Test cashier",
    role: "cashier",
  };
}
export function sale(overrides: Partial<Sale> = {}): Sale {
  const l = lease();
  return {
    version: 1,
    transactionId: crypto.randomUUID(),
    organizationId: l.organizationId,
    branchId: l.branchId,
    deviceId: l.deviceId,
    cashierId: l.cashierId,
    shiftId: l.shiftId,
    occurredAt: new Date().toISOString(),
    items: [makeItem(product, uuid(12), "1", null)],
    total: 3200,
    cashReceived: 5000,
    ...overrides,
  };
}
export async function setupDB(name = crypto.randomUUID()) {
  const db = new PosDatabase(name);
  await setSetting(db, "lease", lease());
  await applySnapshot(db, {
    products: [product],
    stocks: [
      {
        key: product.id + ":none",
        productId: product.id,
        batchId: null,
        quantity: "500",
      },
    ],
    confirmedIds: [],
    asOf: new Date().toISOString(),
  });
  return db;
}
