import { describe, expect, it } from "vitest";
import { productSetup } from "../../apps/web/lib/product-setup";

function form(patch: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: "TEST Feed",
    sku: "TEST-25",
    category: "Feeds",
    baseUnit: "kg",
    unit: "Sack",
    factor: "25",
    price: "900",
    cost: "700",
    minimum: "0",
    ...patch,
  }))
    data.set(key, value);
  return data;
}
describe("explicit product selling setup", () => {
  it("does not silently create a free loose unit for a sack", () => {
    expect(productSetup(form()).units).toEqual([
      { name: "Sack", factor: "25", price: 90000, cost: 70000 },
    ]);
  });
  it("retains separate retail prices and costs rather than dividing the sack price", () => {
    expect(
      productSetup(form({ loose: "on", basePrice: "45", baseCost: "28" }))
        .units,
    ).toEqual([
      { name: "Sack", factor: "25", price: 90000, cost: 70000 },
      { name: "Kilo", factor: "1", price: 4500, cost: 2800 },
    ]);
  });
  it.each(["", "0", "1.005", "1e2", "-1"])(
    "rejects an enabled retail price of %s",
    (basePrice) => {
      expect(() =>
        productSetup(form({ loose: "on", basePrice, baseCost: "0" })),
      ).toThrow();
    },
  );
  it("allows explicit zero cost but requires a positive main selling price", () => {
    expect(productSetup(form({ cost: "0" })).units[0].cost).toBe(0);
    expect(() => productSetup(form({ price: "0" }))).toThrow();
  });
  it("keeps a sealed packet as one indivisible piece without loose selling", () => {
    expect(
      productSetup(
        form({
          baseUnit: "piece",
          unit: "Packet",
          factor: "1",
          price: "60",
          cost: "40",
        }),
      ).units,
    ).toEqual([{ name: "Packet", factor: "1", price: 6000, cost: 4000 }]);
    expect(() =>
      productSetup(form({ baseUnit: "piece", factor: "2.5" })),
    ).toThrow(/whole number/);
  });
  it("does not create a duplicate retail unit for loose-only products", () => {
    expect(
      productSetup(form({ unit: "Kilo", factor: "1" })).units,
    ).toHaveLength(1);
    expect(() =>
      productSetup(form({ unit: "Kilo", factor: "1", loose: "on" })),
    ).toThrow(/already uses/);
  });
  it("supports a measured container with a separate liter price and exact conversion", () => {
    const result = productSetup(
      form({
        baseUnit: "liter",
        unit: "Container",
        factor: "2.5",
        loose: "on",
        basePrice: "21.50",
        baseCost: "14.01",
        expiry: "on",
      }),
    );
    expect(result.units[0].factor).toBe("2.5");
    expect(result.units[1]).toEqual({
      name: "Liter",
      factor: "1",
      price: 2150,
      cost: 1401,
    });
    expect(result.tracksExpiry).toBe(true);
  });
  it("requires clear distinct unit names and valid low-stock precision", () => {
    expect(() => productSetup(form({ unit: "Kilo", loose: "on" }))).toThrow(
      /different name/,
    );
    expect(() => productSetup(form({ minimum: "-1" }))).toThrow(/low-stock/);
  });
});

it("uses real metres per rope roll with a separately priced cut metre",()=>{
 expect(productSetup(form({baseUnit:"meter",unit:"Roll",factor:"100",loose:"on",basePrice:"12.50",baseCost:"8"})).units).toEqual([{name:"Roll",factor:"100",price:90000,cost:70000},{name:"Meter",factor:"1",price:1250,cost:800}]);
 expect(productSetup(form({baseUnit:"liter",unit:"500 ml bottle",factor:"0.5"})).units[0].factor).toBe("0.5");
});
