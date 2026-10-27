import { beforeEach, describe, expect, it } from "vitest";
import { makeItem } from "@agristore/domain";
import {
  enteredQuantity,
  estimateBudget,
  kiloUnit,
  quantityFromDisplay,
} from "../../apps/web/lib/quantity-entry";
import { draftLineTotal, useCart } from "../../apps/web/lib/cart";
import { product, uuid } from "./fixtures";
import { productStock } from "../../apps/web/lib/stock-display";

describe("exact on-hand display", () => {
  it("does not round a missing quarter kilo back up to ten sacks", () => {
    expect(
      productStock(product, new Map([[product.id + ":none", "499.75"]])),
    ).toEqual({ quantity: "499.75", unit: "kg" });
  });
  it("adds every batch exactly, including when an unbatched row also exists", () => {
    expect(
      productStock(
        product,
        new Map([
          [product.id + ":none", "0.1"],
          [product.id + ":lot-a", "0.2"],
          [uuid(30) + ":none", "999"],
        ]),
      ),
    ).toEqual({ quantity: "0.3", unit: "kg" });
  });
  it("keeps piece packs whole and shows remaining base pieces for a partial pack equivalent", () => {
    const packed = {
      ...product,
      baseUnit: "piece",
      units: [{ ...product.units[0], name: "Box", factor: "12" }],
    };
    expect(
      productStock(packed, new Map([[product.id + ":none", "24"]])),
    ).toEqual({ quantity: "2", unit: "box" });
    expect(
      productStock(packed, new Map([[product.id + ":none", "23"]])),
    ).toEqual({ quantity: "23", unit: "piece" });
  });
});

describe("cashier quantity entry", () => {
  it.each([
    ["0.5", "0.5"],
    [".5", "0.5"],
    ["1/4", "0.25"],
    [" 1 / 2 ", "0.5"],
    ["¼", "0.25"],
    ["½", "0.5"],
    ["¾", "0.75"],
    ["0.000001", "0.000001"],
  ])("normalizes %s exactly", (input, expected) => {
    expect(enteredQuantity(input)).toBe(expected);
  });
  it.each([
    "",
    "0",
    "0.",
    "-1",
    "1e2",
    "1/0",
    "1/3",
    "1.0000001",
    "1000000000000",
  ])("rejects incomplete or unsupported %s", (input) => {
    expect(() => enteredQuantity(input)).toThrow();
  });
  it("converts scale grams exactly and rejects excessive canonical precision", () => {
    expect(quantityFromDisplay("250", true)).toBe("0.25");
    expect(quantityFromDisplay("1428.5", true)).toBe("1.4285");
    expect(() => quantityFromDisplay("0.000001", true)).toThrow();
  });
  it("uses an explicitly configured kilo unit instead of dividing sack price", () => {
    expect(kiloUnit(product)?.price).toBe(3200);
    expect(kiloUnit({ ...product, units: [product.units[0]] })).toBeUndefined();
    expect(kiloUnit({ ...product, baseUnit: "piece" })).toBeUndefined();
    const quarter = makeItem(
      product,
      kiloUnit(product)!.id,
      enteredQuantity("1/4"),
      null,
    );
    expect(quarter.lineTotal).toBe(800);
  });
  it("estimates a peso budget conservatively in whole grams, with half-up centavos", () => {
    expect(estimateBudget("50", 3500)).toEqual({
      quantity: "1.428",
      grams: "1428",
      amount: 4998,
    });
    expect(estimateBudget("0.04", 3500)).toEqual({
      quantity: "0.001",
      grams: "1",
      amount: 4,
    });
    expect(estimateBudget("50", 3360).quantity).toBe("1.488");
  });
  it.each([
    ["0", 3500],
    ["1", 0],
    ["50.123", 3500],
    ["1e2", 3500],
    ["0.01", 3500],
  ])("rejects impossible budget %s at %s", (budget, price) => {
    expect(() => estimateBudget(budget, price)).toThrow();
  });
});

describe("stable checkout line drafts", () => {
  beforeEach(() => useCart.getState().clear());
  it.each(["", "0.", "0", "1/", "1/0", "-1", "1e2"])("does not price an unfinished or invalid draft %s using its cached item", (draft) => {
    const item = makeItem(product, uuid(12), "1", null);
    expect(draftLineTotal(item, { draft, display: "kg" })).toBeNull();
  });
  it("prices matching fractions and grams, including valid unconfirmed estimates", () => {
    const item = makeItem(product, uuid(12), "0.5", null);
    expect(draftLineTotal(item, { draft: "1/2", display: "kg" })).toBe(1600);
    expect(draftLineTotal(item, { draft: "500", display: "g" })).toBe(1600);
  });
  it("hides stale amounts when the entered quantity differs from the valid item", () => {
    const item = makeItem(product, uuid(12), "1", null);
    expect(draftLineTotal(item, { draft: "0.5", display: "kg" })).toBeNull();
    expect(draftLineTotal(item)).toBeNull();
  });
  it("keeps a valid zero-price line visible as zero", () => {
    const free = { ...product, units: product.units.map((u) => ({ ...u, price: 0 })) };
    const item = makeItem(free, uuid(12), "0.5", null);
    expect(draftLineTotal(item, { draft: "0.5", display: "kg" })).toBe(0);
  });
  it("starts direct weight and budget entries empty and blocks their provisional quantities", () => {
    const item = makeItem(product, uuid(12), "1", null);
    useCart.getState().add(item, "weight");
    useCart.getState().add(item, "budget");
    const state = useCart.getState();
    expect(state.lineIds).toHaveLength(2);
    expect(state.drafts[state.lineIds[0]]).toMatchObject({
      draft: "",
      focus: "quantity",
      budgetMode: false,
    });
    expect(state.drafts[state.lineIds[1]]).toMatchObject({
      draft: "",
      focus: "budget",
      budgetMode: true,
      original: null,
    });
    expect(Object.keys(state.quantityErrors)).toHaveLength(2);
  });
  it("retains the other duplicate product's draft and blocking error after removing a row", () => {
    const item = makeItem(product, uuid(12), "1", null);
    useCart.getState().add(item);
    useCart.getState().add(item);
    const [first, second] = useCart.getState().lineIds;
    useCart.getState().edit(second, {
      draft: "0.",
      budgetMode: true,
      budget: "50",
      original: item,
    });
    useCart.getState().quantityError(second, "Confirm scale weight");
    useCart.getState().remove(0);
    expect(useCart.getState().lineIds).toEqual([second]);
    expect(useCart.getState().drafts[second]).toMatchObject({
      draft: "0.",
      budgetMode: true,
      budget: "50",
    });
    expect(useCart.getState().quantityErrors).toEqual({
      [second]: "Confirm scale weight",
    });
    expect(useCart.getState().drafts[first]).toBeUndefined();
    useCart.getState().remove(0);
    expect(useCart.getState().quantityErrors).toEqual({});
    expect(useCart.getState().drafts).toEqual({});
  });
  it("clears drafts with a completed cart and assigns separate checkout attempts", () => {
    const item = makeItem(product, uuid(12), "0.5", null);
    useCart.getState().add(item);
    const first = useCart.getState().attempt();
    expect(useCart.getState().attempt()).toBe(first);
    useCart.getState().clear();
    useCart.getState().add(item);
    expect(useCart.getState().attempt()).not.toBe(first);
    expect(Object.values(useCart.getState().drafts)[0].draft).toBe("0.5");
  });
});

it("prices millilitre drafts against exact litres, and length against fractional metres",()=>{
 const liquid={...product,baseUnit:"liter",units:[{...product.units[1],name:"Liter",factor:"1",price:8000}]};
 const item=makeItem(liquid,liquid.units[0].id,"0.25",null);
 expect(draftLineTotal(item,{draft:"250",display:"ml"})).toBe(2000);
 expect(draftLineTotal(item,{draft:"0.25",display:"liter"})).toBe(2000);
 expect(draftLineTotal(item,{draft:"250",display:"liter"})).toBeNull();
 const rope={...liquid,baseUnit:"meter",units:[{...liquid.units[0],name:"Meter",price:2000}]};
 expect(makeItem(rope,rope.units[0].id,enteredQuantity("1/4"),null).lineTotal).toBe(500);
});
