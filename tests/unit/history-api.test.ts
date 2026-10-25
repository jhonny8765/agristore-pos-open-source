import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { historyPage } from "../../apps/web/lib/history-api";
import { rows } from "../../apps/web/lib/api";
import type { HistoryKind } from "../../apps/web/lib/history";
import { uuid } from "./fixtures";

/** Model PostgREST's JSON boundary: uncast numerics become JSON numbers,
 * whereas a database text cast preserves the full decimal before JSON parsing. */
function databaseResponse(values: Record<string, string>) {
  return createClient("http://127.0.0.1:55321", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== "http://127.0.0.1:55321") throw new Error("Unexpected test destination");
      const selected = url.searchParams.get("select") ?? "*";
      const row: Record<string, unknown> = {
        id: uuid(3), branch_id: uuid(2), product_id: uuid(10),
        created_at: "2026-10-25T01:00:00.000001+00:00",
        dispatched_at: "2026-10-25T01:00:00.000001+00:00",
      };
      for (const [column, value] of Object.entries(values))
        row[column] = selected.includes(`${column}::text`) ? value : Number(value);
      return new Response(JSON.stringify([row]), { headers: { "Content-Type": "application/json" } });
    } },
  });
}

describe("report JSON precision", () => {
  it("preserves signed ledger quantities and large movement IDs", async () => {
    const values = { quantity: "-9999999999.000001", id: "9007199254740993" };
    const result = await rows("inventory_movements", uuid(1), uuid(2), databaseResponse(values));
    expect(result[0]).toMatchObject(values);
  });
  it.each([
    ["transfers", { quantity: "9999999999.000001" }],
    ["counts", { expected: "9999999999.000001", counted: "9999999999.000000", ledger_revision: "9007199254740993" }],
    ["audit", { id: "9007199254740993" }],
  ] satisfies [HistoryKind, Record<string, string>][])("preserves exact %s values before parsing JSON", async (kind, values) => {
    const page = await historyPage({ kind, organizationId: uuid(1), branchId: uuid(2), range: { from: "", to: "" } }, databaseResponse(values));
    for (const [column, value] of Object.entries(values)) expect(page.rows[0][column]).toBe(value);
  });
});
