import { describe, expect, it } from "vitest";
import { historicalStock, stockHistoryColumns } from "../../apps/web/lib/stock-history";
import { historyCsv } from "../../apps/web/lib/history";
import { product, uuid } from "./fixtures";

const catalog = [{ ...product, batches: [
  { id: uuid(80), lot: "FEED-A", expiresOn: "2027-06-30" },
  { id: uuid(81), lot: "FEED-B", expiresOn: null },
] }];
describe("historical stock identity", () => {
  it("distinguishes lots of one product without deriving kilo quantities from sack units", () => {
    expect(historicalStock(catalog, { product_id: product.id, batch_id: uuid(80) }))
      .toEqual({ name: product.name, lot: "Lot FEED-A", expiresOn: "2027-06-30", baseUnit: "kg" });
    expect(historicalStock(catalog, { product_id: product.id, batch_id: uuid(81) }))
      .toEqual({ name: product.name, lot: "Lot FEED-B", expiresOn: null, baseUnit: "kg" });
  });
  it("distinguishes absent lot records from unavailable batch details", () => {
    expect(historicalStock(catalog, { product_id: product.id, batch_id: null }).lot)
      .toBe("No lot recorded");
    expect(historicalStock(catalog, { product_id: product.id, batch_id: uuid(82) }).lot)
      .toBe(`Batch ${uuid(82)} (details unavailable)`);
  });
  it("never borrows another product's batch or guesses an unavailable measurement", () => {
    expect(historicalStock(catalog, { product_id: uuid(99), batch_id: uuid(80) }))
      .toEqual({ name: `Product ${uuid(99)}`, lot: `Batch ${uuid(80)} (details unavailable)`, expiresOn: null, baseUnit: "" });
  });
  it("keeps product and batch IDs, expiry and explicit base units in CSV exports", () => {
    const csv = historyCsv(stockHistoryColumns(catalog), [
      { product_id: product.id, batch_id: uuid(80) },
      { product_id: product.id, batch_id: uuid(81) },
    ]);
    expect(csv).toContain('"Product","Product ID","Batch ID","Lot","Expiry date","Base unit"');
    expect(csv).toContain(`"${uuid(80)}","Lot FEED-A","2027-06-30","kg"`);
    expect(csv).toContain(`"${uuid(81)}","Lot FEED-B","","kg"`);
  });
});
