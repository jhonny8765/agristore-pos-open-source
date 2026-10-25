import {
  type Lease,
  type Product,
  type Snapshot,
  OFFLINE_HOURS,
} from "@agristore/domain";
import {
  PosDatabase,
  applySnapshot,
  setSetting,
  setting,
} from "@agristore/offline";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const practiceBranch = {
  id: id(2),
  name: "Practice branch",
  code: "DEMO",
};
const definitions = [
  [
    "Grower feeds",
    "FEED-001",
    "Feeds",
    "kg",
    50,
    158000,
    138000,
    "Sack (50 kg)",
  ],
  [
    "Urea 46-0-0",
    "FERT-001",
    "Fertilizers",
    "kg",
    50,
    165000,
    143000,
    "Bag (50 kg)",
  ],
  ["Hybrid corn seeds", "SEED-001", "Seeds", "piece", 1, 420000, 350000, "Bag"],
  ["Layer mash", "FEED-002", "Feeds", "kg", 50, 149000, 127000, "Sack (50 kg)"],
  [
    "Garden hand sprayer",
    "TOOL-001",
    "Tools",
    "piece",
    1,
    85000,
    63000,
    "Piece",
  ],
  [
    "Complete 14-14-14",
    "FERT-002",
    "Fertilizers",
    "kg",
    50,
    176000,
    151000,
    "Bag (50 kg)",
  ],
  [
    "Organic compost",
    "SOIL-001",
    "Soil care",
    "kg",
    25,
    32000,
    23000,
    "Bag (25 kg)",
  ],
  [
    "Animal vitamin mix",
    "CARE-001",
    "Animal care",
    "piece",
    1,
    14500,
    10000,
    "Sachet",
  ],
] as const;
export const practiceProducts: Product[] = definitions.map((d, i) => ({
  id: id(100 + i),
  name: d[0],
  sku: d[1],
  category: d[2],
  baseUnit: d[3],
  minimumStock: "100",
  tracksExpiry: false,
  active: true,
  batches: [],
  units: [
    {
      id: id(200 + i),
      name: d[7],
      factor: String(d[4]),
      price: d[5],
      cost: d[6],
      priceVersion: 1,
    },
    ...(d[3] === "kg"
      ? [
          {
            id: id(300 + i),
            name: "Kilo",
            factor: "1",
            price: Math.ceil(d[5] / d[4]) + 200,
            cost: Math.ceil(d[6] / d[4]),
            priceVersion: 1,
          },
        ]
      : []),
  ],
}));
export async function startPractice(db: PosDatabase): Promise<Lease> {
  let lease = await setting<Lease>(db, "lease");
  if (!lease) {
    lease = {
      organizationId: id(1),
      branchId: id(2),
      deviceId: id(3),
      cashierId: id(4),
      shiftId: id(5),
      issuedAt: Date.now(),
      expiresAt: Date.now() + OFFLINE_HOURS * 3600_000,
      name: "Practice cashier",
      role: "owner",
      practice: true,
    };
    await setSetting(db, "lease", lease);
    const snapshot: Snapshot = {
      products: practiceProducts,
      stocks: practiceProducts.map((p, i) => ({
        key: p.id + ":none",
        productId: p.id,
        batchId: null,
        quantity: String([2100, 1450, 42, 1700, 18, 900, 600, 120][i]),
      })),
      confirmedIds: [],
      asOf: new Date().toISOString(),
    };
    await applySnapshot(db, snapshot);
  }
  if (lease.expiresAt < Date.now()) {
    lease = {
      ...lease,
      issuedAt: Date.now(),
      expiresAt: Date.now() + OFFLINE_HOURS * 3600_000,
    };
    await setSetting(db, "lease", lease);
  }
  return lease;
}
