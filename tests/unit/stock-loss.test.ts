import { describe, expect, it } from "vitest";
import { lossCsv, purchaseCentavos, reconciliationCsv, reportMoney, type LossReport } from "../../apps/web/lib/stock-loss";
describe("purchase-cost reporting contracts", () => {
  it("preserves exact centavos above the JavaScript safe-integer range", () => {
    expect(reportMoney("900719925474099301")).toBe("₱9,007,199,254,740,993.01");
    expect(reportMoney("900719925474099399999999999999999901")).toBe("₱9,007,199,254,740,993,999,999,999,999,999,999.01");
    expect(reportMoney("625")).toBe("₱6.25");
    expect(reportMoney("0")).toBe("₱0.00");
    expect(reportMoney(null)).toBe("Cost not documented");
  });
  it("requires an explicit valid purchase cost and never turns blank input into zero", () => {
    expect(purchaseCentavos("1250.50")).toBe("125050");
    expect(purchaseCentavos("0")).toBe("0");
    expect(purchaseCentavos("999999999999.99")).toBe("99999999999999");
    for (const raw of ["", " ", "-1", "1.001", "NaN", "Infinity", "1,250"]) expect(() => purchaseCentavos(raw)).toThrow();
  });
  it("exports only supplied rows with exact numeric fields, scope and safe text", () => {
    const report = { asOf: "2026-10-26T08:00:00Z", fromDate: "2026-10-01", throughDate: "2026-10-26", rows: [{ loss_key: "movement:123", branch_name: "=formula", quantity: "0.250000", unit_cost_centavos: "125000", unit_factor: "50.000000", value_centavos: "625", reference: " +SUM(A1)", evidence_id: "TEST cost" }], reconciliation: [{ product_name: "@formula", sales: "-0.250000", balance_end: "9999999999.000003" }] } as unknown as LossReport;
    const losses = lossCsv(report, "TEST branch");
    expect(losses).toContain('"TEST branch"'); expect(losses).toContain('"0.250000"'); expect(losses).toContain('"125000"'); expect(losses).toContain('"625"');
    expect(losses).toContain('"\'=formula"'); expect(losses).toContain('"\' +SUM(A1)"');
    const stock = reconciliationCsv(report, "TEST branch");
    expect(stock).toContain('"-0.250000"'); expect(stock).toContain('"9999999999.000003"'); expect(stock).toContain('"\'@formula"');
    expect(stock.split("\r\n")).toHaveLength(2);
  });
});
