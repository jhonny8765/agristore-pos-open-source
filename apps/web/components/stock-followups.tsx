"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Decimal from "decimal.js";
import type { PosDatabase } from "@agristore/offline";
import type { Product } from "@agristore/domain";
import { command } from "../lib/api";
import { onlineOperation } from "../lib/operations";
import { expiryStatus, investigationDue, type FollowUps, type Investigation } from "../lib/stock-followups";
import { ApprovalForm } from "./approval-form";
import { Button } from "./ui/button";

type Cursor = FollowUps["next"] | FollowUps["expiryNext"];
const value = (f: FormData, name: string) => String(f.get(name) ?? "").trim();
const time = (text: string) => new Date(text).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
function evidence(row: Investigation, products: Product[]) {
  const d = row.details, item = (d.item ?? {}) as Record<string, unknown>;
  const p = products.find(p => p.id === (d.productId ?? item.productId));
  return [p?.name, d.expected !== undefined ? `Expected: ${d.expected} · Counted: ${d.counted} ${p?.baseUnit ?? "base units"}` : "",
    d.dispatched !== undefined ? `Dispatched: ${d.dispatched} base units` : "", d.quantity !== undefined ? `Quantity: ${d.quantity} base units` : "",
    d.reference ? `Supplier document: ${d.reference}` : "", item.documentQuantity !== undefined ? `Document quantity: ${item.documentQuantity} · Accepted: ${item.quantity} selling units` : "",
    Array.isArray(d.flags) ? `Review: ${d.flags.map(f => String(f).replaceAll("_", " ")).join(", ")}` : "", d.reason, d.notes, item.deliveryNotes].filter(Boolean).join("\n") || "Review the source record and physical goods before recording an outcome.";
}
export function StockFollowUps({ db, organizationId, branchId, actorId, products, owner, canAssign, online, disabled, revision, execute }: {
  db: PosDatabase; organizationId: string; branchId: string; actorId: string; products: Product[];
  owner: boolean; canAssign: boolean; online: boolean; disabled: boolean; revision: number;
  execute: (fn: () => Promise<void>) => Promise<Error | undefined>;
}) {
  const [data, setData] = useState<FollowUps>();
  const [filter, setFilter] = useState("all"), [expiryFilter, setExpiryFilter] = useState("all"), [horizon, setHorizon] = useState("30");
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [feedback, setFeedback] = useState("");
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async (mode: "reset" | "cases" | "expiry" = "reset", cursor?: Cursor) => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const next = await command<FollowUps>("stock_followups", { organizationId, branchId, filter, expiryFilter, horizonDays: Number(horizon),
        ...(mode === "cases" ? { cursor } : {}), ...(mode === "expiry" ? { expiryCursor: cursor } : {}) });
      if (request !== generation.current) return;
      setData(previous => ({ ...next,
        cases: mode === "expiry" ? previous?.cases ?? next.cases : mode === "cases" ? [...previous?.cases ?? [], ...next.cases] : next.cases,
        next: mode === "expiry" ? previous?.next ?? null : next.next,
        expiry: mode === "cases" ? previous?.expiry ?? next.expiry : mode === "expiry" ? [...previous?.expiry ?? [], ...next.expiry] : next.expiry,
        expiryNext: mode === "cases" ? previous?.expiryNext ?? null : next.expiryNext }));
      setError("");
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : "Could not refresh reminders. Reconnect and retry."); }
    finally { if (request === generation.current) setLoading(false); }
  }, [organizationId, branchId, filter, expiryFilter, horizon]);
  useEffect(() => {
    if (online) void load();
    return invalidate;
  }, [online, load, revision, invalidate]);
  const blocked = disabled || !online || loading;
  async function save(action: string, body: Record<string, unknown>) {
    const context = { organizationId, branchId, ...body };
    if (action === "resolve_stock_exception") await command(action, context);
    else await onlineOperation(db, actorId, action, context, "followUpId");
    setFeedback(action === "resolve_stock_exception" ? "Owner resolution recorded. Original stock history is retained." : "Follow-up recorded. The investigation remains open and stock has not changed.");
    await load();
  }
  return <>
    <section className="panel stock-followups" aria-label="Stock reminders and follow-up status">
      <div className="section-heading"><h2>Expiry reminders</h2><Button variant="outline" disabled={blocked} onClick={() => void load()}>Refresh reminders and investigations</Button></div>
      <p>Inspect expiry labels and keep expired goods separate. Use Record stock issue below for an owner-approved hold. Reminders never deduct stock.</p>
      <div className="form-grid">
        <label className="field"><span>Look ahead</span><select value={horizon} disabled={blocked} onChange={e => { setData(undefined); setHorizon(e.target.value); }}><option value="7">Next 7 days</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option></select></label>
        <label className="field"><span>Expiry filter</span><select value={expiryFilter} disabled={blocked} onChange={e => { setData(undefined); setExpiryFilter(e.target.value); }}><option value="all">All reminders</option><option value="expired">Expired</option><option value="today">Expires today</option><option value="soon">Approaching expiry</option><option value="missing">Expiry missing</option></select></label>
      </div>
      {feedback && <p role="status" className="notice success">{feedback}</p>}
      {error && <p role="alert" className="notice error">{error} Loaded records are retained. Reconnect and select Refresh reminders and investigations.</p>}
      {!online && <p className="notice">Reconnect for current reminders and assignments. Dates and quantities shown earlier may have changed.</p>}
      {loading && <p role="status">Refreshing reminders and investigations…</p>}
      {data ? <>
        <p>As of {time(data.asOf)} · Asia/Manila · {data.expiryTotals.expired} expired · {data.expiryTotals.today} expire today · {data.expiryTotals.soon} approaching expiry · {data.expiryTotals.missing} missing expiry. Refresh before acting.</p>
        {data.expiry.length ? <div className="table-wrap history-table stock-control-table" role="region" aria-label="Expiry reminders" tabIndex={0}><table><thead><tr><th scope="col">Product / lot</th><th scope="col">Reminder / physical quantities</th></tr></thead><tbody>{data.expiry.map(row => <tr key={`${row.product_id}:${row.batch_id ?? "none"}`}>
          <td><strong>{row.product_name}</strong><small>{row.sku} · Lot: {row.lot}</small><small>Expiry: {row.expires_on ?? "not recorded"}</small></td>
          <td><strong>{expiryStatus(row)}</strong><small>On hand: {new Decimal(row.saleable).toFixed()} {row.base_unit}</small><small>Held separately: {new Decimal(row.held).toFixed()} {row.base_unit}</small></td>
        </tr>)}</tbody></table></div> : <p>No stock matches this expiry filter. Missing expiry dates appear separately when expiry tracking is required.</p>}
        <p>{data.expiry.length} reminder rows loaded. {data.expiryNext ? "More reminders are available." : "End of matching reminders."}</p>
        {data.expiryNext && <Button variant="outline" disabled={blocked} onClick={() => void load("expiry", data.expiryNext)}>Load more expiry reminders</Button>}
      </> : !loading && <p>{error ? "Current reminders are unavailable. Retry online." : "Connect to load reminders."}</p>}
    </section>
    <section className="panel stock-followups">
      <h2>Stock investigations</h2>
      <p>Unresolved differences remain open until the owner records the evidence and outcome. Assigning a person or recording progress does not close a case or change stock.</p>
      <label className="field followup-filter"><span>Investigation filter</span><select value={filter} disabled={blocked} onChange={e => { setData(undefined); setFilter(e.target.value); }}><option value="all">All unresolved</option><option value="overdue">Overdue</option><option value="due_today">Due today</option><option value="unassigned">Unassigned / needs reassignment</option><option value="mine">Assigned to me</option></select></label>
      {data && <>
        <p role="status">{data.totals.open} open investigations · {data.totals.overdue} overdue · {data.totals.dueToday} due today · {data.totals.unassigned} need assignment. Showing {data.cases.length} matching cases, oldest first.</p>
        {data.cases.length ? <div className="table-wrap history-table stock-control-table" role="region" aria-label="Open stock investigations" tabIndex={0}><table><thead><tr><th scope="col">Issue / evidence / follow-up</th><th scope="col">Follow-up actions</th></tr></thead><tbody>{data.cases.map(row => <tr key={`${row.id}:${row.follow_up_version}`}>
          <td><strong>{row.kind.replaceAll("_", " ")}</strong><small>{time(row.created_at)} · Source: {row.source_id}</small>
            <details><summary>Recorded details</summary><p className="stock-evidence">{evidence(row, products)}</p></details>
            <p><strong>Responsible: {row.assigned_user_id ? row.assigned_to : "Unassigned"}</strong></p>
            {row.assigned_user_id && !row.assignee_active && <p className="quantity-error">Reassignment required: this account is inactive or no longer authorized for this branch.</p>}
            <p className={row.due_on && row.due_on <= data.today ? "quantity-error" : ""}>{investigationDue(row, data.today)}</p>
            {row.assignment_note && <p className="stock-evidence">Assignment: {row.assignment_note}</p>}
            {row.progress_note && <p className="stock-evidence">Latest progress{row.progress_at ? ` · ${time(row.progress_at)}` : ""}: {row.progress_note}</p>}
            <small>Assignment and progress history are retained in the audit record.</small>
          </td>
          <td><div className="followup-actions">
            {canAssign && <ApprovalForm action="Assign follow-up" label="Assignment instructions" description="Choose the responsible employee and deadline. Record what they must check. This keeps the case open." confirmLabel="Save assignment" disabled={blocked} onConfirm={(reason, f) => execute(() => save("assign_stock_exception", { exceptionId: row.id, expectedVersion: row.follow_up_version, assigneeId: value(f, "assignee"), dueOn: value(f, "due"), reason }))}>
              <label className="field"><span>Responsible employee</span><select name="assignee" required defaultValue={row.assignee_active ? row.assigned_user_id ?? "" : ""}><option value="">Choose an employee</option>{data.staff.map(s => <option key={s.userId} value={s.userId}>{s.name} · {s.role.replaceAll("_", " ")}</option>)}</select></label>
              <label className="field"><span>Follow-up due date</span><input name="due" type="date" min="2000-01-01" max="2100-12-31" required defaultValue={row.due_on ?? data.today} /></label>
            </ApprovalForm>}
            {(canAssign || row.assigned_user_id === actorId) && <ApprovalForm action="Record progress" label="Progress evidence" description="Record what was checked and what is still unresolved. Only the owner can close the investigation." confirmLabel="Save progress" disabled={blocked} onConfirm={reason => execute(() => save("note_stock_exception", { exceptionId: row.id, expectedVersion: row.follow_up_version, reason }))} />}
            {owner ? <ApprovalForm action="Resolve investigation" label="Evidence and outcome" description="Record what was checked, the cause if established, and the corrective action. This does not change stock." confirmLabel="Record resolution" disabled={blocked} onConfirm={reason => execute(() => save("resolve_stock_exception", { exceptionId: row.id, reason }))} /> : <p>Owner resolution required.</p>}
          </div></td>
        </tr>)}</tbody></table></div> : <p>No unresolved investigations match this filter.</p>}
        <p>{data.next ? "Older-first worklist continues; more matching cases remain." : "End of matching unresolved cases. Resolved history remains retained."}</p>
        {data.next && <Button variant="outline" disabled={blocked} onClick={() => void load("cases", data.next)}>Load more investigations</Button>}
      </>}
    </section>
  </>;
}
