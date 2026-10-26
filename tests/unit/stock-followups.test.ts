import { describe, expect, it } from "vitest";
import { expiryStatus, investigationDue } from "../../apps/web/lib/stock-followups";
describe("stock reminder language", () => {
  it("keeps overdue, today and future deadlines distinct using business dates", () => {
    expect(investigationDue({ due_on: null }, "2026-10-26")).toBe("No due date");
    expect(investigationDue({ due_on: "2026-10-25" }, "2026-10-26")).toBe("Overdue · 2026-10-25");
    expect(investigationDue({ due_on: "2026-10-26" }, "2026-10-26")).toBe("Due today · 2026-10-26");
    expect(investigationDue({ due_on: "2026-10-27" }, "2026-10-26")).toBe("Due 2026-10-27");
  });
  it("never treats missing expiry as safe stock", () => {
    expect(expiryStatus({ status: "missing", days_left: null })).toContain("inspect label");
    expect(expiryStatus({ status: "expired", days_left: -7 })).toBe("Expired 7 day(s) ago");
    expect(expiryStatus({ status: "today", days_left: 0 })).toBe("Expires today");
    expect(expiryStatus({ status: "soon", days_left: 30 })).toBe("Expires in 30 day(s)");
  });
});
