import { expect, it } from "vitest";
import { inspectedTotals, inspectionsCsv, purchaseQuantity, type DeliveryInspection } from "../../apps/web/lib/purchasing";
it("requires explicit exact quantities and rejects blank, nonfinite and negative inputs", () => {
  expect(purchaseQuantity("0.250000",true)).toBe("0.25"); expect(purchaseQuantity("0")).toBe("0");
  for(const value of ["", "-1", "NaN", "Infinity", "0.0000001", "1,000"]) expect(()=>purchaseQuantity(value)).toThrow();
  expect(()=>purchaseQuantity("0",true)).toThrow();
});
it("keeps rejected and missing deliveries distinct from accepted stock",()=>{
  expect(inspectedTotals("10","0","0","10")).toEqual({physical:"10",difference:"0"});
  expect(inspectedTotals("10","7.25","1","0.5")).toEqual({physical:"8.75",difference:"-1.25"});
  expect(inspectedTotals("10","0","0","0")).toEqual({physical:"0",difference:"-10"});
  expect(()=>inspectedTotals("0","0","0","0")).toThrow();
});
it("exports only loaded lines with exact values, scope and formula-safe text",()=>{
  const rows=[{id:"TEST-ID",reference:"=formula",supplier_name:"TEST supplier",order_reference:"TEST-PO",created_at:"2026-10-26T17:00:00Z",claim_state:"open",lines:[{product_name:"TEST feed",unit_name:"Sack",factor:"50",base_unit:"kg",document_quantity:"1",accepted:"0.25",held:"0.25",rejected:"0.25",held_remaining:"12.5",reason:"+formula"}]}] as DeliveryInspection[];
  const csv=inspectionsCsv(rows,"TEST branch","2026-10-27T01:00:00+08:00");
  expect(csv).toContain('"\'=formula"');expect(csv).toContain('"\'+formula"');expect(csv).toContain('"-0.25"');expect(csv).toContain('"TEST branch"');expect(csv.split("\r\n")).toHaveLength(2);
});
