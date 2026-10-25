import { describe, expect, it } from "vitest";
import {
  historyBounds,
  historyCsv,
  validateHistoryCursor,
} from "../../apps/web/lib/history";

describe("Manila report dates", () => {
  it("includes the entire end day and starts at Manila midnight", () => {
    expect(historyBounds({ from: "2026-10-23", to: "2026-10-23" })).toEqual({
      from: "2026-10-22T16:00:00.000Z",
      to: "2026-10-23T16:00:00.000Z",
    });
  });
  it("handles leap days and month boundaries", () => {
    expect(historyBounds({ from: "2028-02-29", to: "2028-02-29" })).toEqual({
      from: "2028-02-28T16:00:00.000Z",
      to: "2028-02-29T16:00:00.000Z",
    });
  });
  it("rejects impossible and inverted dates", () => {
    expect(() => historyBounds({ from: "2026-02-29", to: "" })).toThrow(
      "valid calendar date",
    );
    expect(() =>
      historyBounds({ from: "2026-10-24", to: "2026-10-23" }),
    ).toThrow("end date");
  });
  it("supports open-ended ranges", () => {
    expect(historyBounds({ from: "", to: "" })).toEqual({
      from: undefined,
      to: undefined,
    });
    expect(historyBounds({ from: "", to: "2026-01-01" }).to).toBe(
      "2026-01-01T16:00:00.000Z",
    );
  });
});
describe("history safety", () => {
  it("accepts exact microseconds and arbitrarily large decimal audit IDs", () => {
    expect(() =>
      validateHistoryCursor("audit", {
        at: "2026-10-23T10:00:00.123456+00:00",
        id: "9007199254740993",
      }),
    ).not.toThrow();
  });
  it("rejects raw filter syntax in cursor values", () => {
    expect(() =>
      validateHistoryCursor("audit", {
        at: "2026-10-23T10:00:00Z",
        id: "1),branch_id.not.is.null",
      }),
    ).toThrow();
    expect(() =>
      validateHistoryCursor("counts", {
        at: "2026-10-23T10:00:00Z,or()",
        id: "00000000-0000-0000-0000-000000000001",
      }),
    ).toThrow();
  });
  it("escapes quotes/newlines and preserves Philippine text", () => {
    const result = historyCsv(
      [{ label: "Reference", value: (r) => r.ref }],
      [{ ref: 'TEST "Sample Branch A", ₱\nseeds' }],
    );
    expect(result).toBe('\uFEFF"Reference"\r\n"TEST ""Sample Branch A"", ₱\nseeds"');
  });
  it("neutralizes formula text without turning real negative numbers into formulas", () => {
    const result = historyCsv(
      [
        { label: "Text", value: (r) => r.text },
        { label: "Quantity", value: (r) => r.qty },
      ],
      [
        { text: " \t=HYPERLINK(1)", qty: -2 },
        { text: "+SUM(1)", qty: 3 },
      ],
    );
    expect(result).toContain('"\' \t=HYPERLINK(1)","-2"');
    expect(result).toContain('"\'+SUM(1)","3"');
  });
  it("exports exact signed decimals only in numeric columns while still blocking formula expressions", () => {
    const csv = historyCsv([
      { label: "Difference", numeric: true, value: (r) => r.quantity },
      { label: "Reason", value: (r) => r.quantity },
    ], [
      { quantity: "-99999999999999.000001" },
      { quantity: "-0.25" },
      { quantity: "-1+SUM(1)" },
      { quantity: " =HYPERLINK(1)" },
    ]);
    expect(csv).toContain('"-99999999999999.000001","\'-99999999999999.000001"');
    expect(csv).toContain('"-0.25","\'-0.25"');
    expect(csv).toContain('"\'-1+SUM(1)","\'-1+SUM(1)"');
    expect(csv).toContain('"\' =HYPERLINK(1)","\' =HYPERLINK(1)"');
  });
});
