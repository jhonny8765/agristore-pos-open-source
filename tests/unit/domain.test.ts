import { describe, expect, it } from "vitest";
import {
  canonicalQuantity,
  lineTotal,
  makeItem,
  requireLease,
  saleSchema,
  stableJSON,
} from "@agristore/domain";
import { parseOpeningCSV } from "../../apps/web/lib/import";
import { lease, product, sale, uuid } from "./fixtures";
describe("exact quantities and cash", () => {
  it("converts sacks and fractional kilos without floating point drift", () => {
    expect(canonicalQuantity("2", "50")).toBe("100");
    expect(canonicalQuantity("0.1", "0.2")).toBe("0.02");
  });
  it("rounds centavos half-up per line", () => {
    expect(lineTotal("0.5", 101)).toBe(51);
    expect(lineTotal("1.234567", 100)).toBe(123);
  });
  it.each(["0", "-1", "1e3", "NaN", "1.0000001"])(
    "rejects invalid quantity %s",
    (q) => {
      expect(() => canonicalQuantity(q, "1")).toThrow();
    },
  );
  it("rejects a conversion that would silently round", () => {
    expect(() => canonicalQuantity("0.000001", "0.000001")).toThrow();
  });
  it("requires cash to cover the receipt", () => {
    expect(() => saleSchema.parse(sale({ cashReceived: 100 }))).toThrow();
  });
  it("checks line totals and total independently", () => {
    const s = sale();
    s.items[0].lineTotal = 1;
    expect(() => saleSchema.parse(s)).toThrow();
    expect(() => saleSchema.parse(sale({ total: 1 }))).toThrow();
  });
  it("rejects unknown envelope fields and unsupported versions", () => {
    expect(() => saleSchema.parse({ ...sale(), version: 2 })).toThrow();
    expect(() => saleSchema.parse({ ...sale(), editable: true })).toThrow();
  });
  it("compares records independently of object property order", () => {
    expect(stableJSON({ b: 1, a: 2 })).toBe(stableJSON({ a: 2, b: 1 }));
  });
  it("blocks unauthorized and expired local checkout", () => {
    expect(() => requireLease(undefined)).toThrow();
    expect(() => requireLease({ ...lease(), expiresAt: 0 })).toThrow();
    expect(() => requireLease({ ...lease(), role: "stock_staff" })).toThrow();
  });
  it("requires a valid unexpired batch for tracked products", () => {
    const p = {
      ...product,
      tracksExpiry: true,
      batches: [{ id: uuid(22), lot: "OLD", expiresOn: "2020-01-01" }],
    };
    expect(() => makeItem(p, uuid(12), "1", null)).toThrow();
    expect(() => makeItem(p, uuid(12), "1", uuid(22), "2026-10-22")).toThrow();
  });
  it("does not sell a fraction of a piece", () => {
    expect(() =>
      makeItem({ ...product, baseUnit: "piece" }, uuid(12), "0.5", null),
    ).toThrow("whole number");
  });
  it("parses quoted CSV and resolves actual selling units", () => {
    const rows = parseOpeningCSV(
      'sku,unit,quantity,lot,expiresOn\nFEED-01,Sack,2,"Lot, one",\n',
      [product],
    );
    expect(rows[0].lot).toBe("Lot, one");
    expect(rows[0].unitId).toBe(uuid(11));
  });
  it("rejects unknown products, broken quotes and missing headers in imports", () => {
    expect(() =>
      parseOpeningCSV("sku,unit,quantity,lot,expiresOn\nmissing,Sack,2,,", [
        product,
      ]),
    ).toThrow();
    expect(() => parseOpeningCSV('"bad', [])).toThrow();
    expect(() => parseOpeningCSV("sku,quantity\nA,1", [])).toThrow();
  });
  it.each([
    ["sku,unit,quantity,lot,expiresOn,quantity\nFEED-01,Sack,2,,,3", "duplicate"],
    ["sku,unit,quantity,lot,expiresOn\nFEED-01,Sack,2,,,extra", "columns"],
    ["sku,unit,quantity,lot,expiresOn\nFEED-01,Sack,2", "columns"],
    ['sku,unit,quantity,lot,expiresOn\nFEED-01,Sack,2,"Lot"junk,', "quote"],
    ["sku,unit,quantity,lot,expiresOn\nFEED-01,Sack,2,TEST,2026-02-30", "expiry"],
  ])("rejects ambiguous or invalid opening file: %s", (csv, error) => {
    expect(() => parseOpeningCSV(csv, [product])).toThrow(error);
  });
  it("rejects a fractional sealed piece before opening-stock confirmation", () => {
    const sealed = { ...product, baseUnit: "piece", units: [{ ...product.units[1], factor: "1" }] };
    expect(() => parseOpeningCSV("sku,unit,quantity,lot,expiresOn\nFEED-01,Kilo,0.5,,", [sealed])).toThrow("whole");
  });
  it("keeps valid BOM, CRLF, reordered columns, escaped quotes and leap-day expiry", () => {
    const rows = parseOpeningCSV('\uFEFFquantity,unit,sku,expiresOn,lot\r\n0.5,Kilo,FEED-01,2028-02-29,"Lot ""Sample Branch C"", A"\r\n', [product]);
    expect(rows[0]).toMatchObject({ quantity: "0.5", lot: 'Lot "Sample Branch C", A', expiresOn: "2028-02-29" });
  });
});
