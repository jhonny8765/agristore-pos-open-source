"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Decimal from "decimal.js";
import type { Product } from "@agristore/domain";
import type { PosDatabase } from "@agristore/offline";
import { command } from "../lib/api";
import { onlineOperation } from "../lib/operations";
import { stockMeasurement } from "../lib/stock-quantity";
import { historyBounds } from "../lib/history";
import { businessDay, lossCsv, lossValueCentavos, purchaseCentavos, reconciliationCsv, reconciliationQuantities, reportMoney, type CostHistoryRow, type LossReport, type LossRow } from "../lib/stock-loss";
import { ApprovalForm } from "./approval-form";
import { Button } from "./ui/button";

const stamp = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function CostHistory({ organizationId, row, asOf, online }: { organizationId: string; row: LossRow; asOf: string; online: boolean }) {
  const [history, setHistory] = useState<CostHistoryRow[]>(), [next, setNext] = useState<{ revision: number } | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  async function load(more = false) {
    setLoading(true);
    try {
      const result = await command<{ rows: CostHistoryRow[]; next: { revision: number } | null }>("loss_cost_history", { organizationId, branchId: row.branch_id, lossKey: row.loss_key, asOf, ...(more ? { cursor: next } : {}) });
      setHistory(old => more ? [...old ?? [], ...result.rows] : result.rows); setNext(result.next); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read cost history. Retry online."); }
    finally { setLoading(false); }
  }
  return <div className="loss-cost-history">
    {!history ? <Button size="sm" variant="outline" disabled={!online || loading} onClick={() => void load()}>View purchase-cost history</Button> : <>
      <p>Recorded cost versions at this report snapshot:</p>
      <ol>{history.map(item => <li key={item.id}><strong>{reportMoney(item.unit_cost_centavos)} / {item.unit_name}</strong> · {item.unit_factor} base units per unit<br />{item.reference} · {item.reason}<br />{item.recorded_name} · {stamp(item.created_at)} · Version {item.revision}</li>)}</ol>
      {!history.length && <p>No documented cost has been recorded.</p>}
      {next && <Button size="sm" variant="outline" disabled={!online || loading} onClick={() => void load(true)}>Load earlier cost evidence</Button>}
    </>}
    {loading && <p role="status">Loading cost history…</p>}{error && <p role="alert" className="notice error">{error}</p>}
  </div>;
}
function CostEvidenceFields({product,row,hint}:{product:Product;row:LossRow;hint:string}){
 const [unitId,setUnitId]=useState(""),[cost,setCost]=useState("");const unit=product.units.find(u=>u.id===unitId);let preview="",error="";
 if(unit&&cost.trim())try{preview=reportMoney(lossValueCentavos(row.quantity,purchaseCentavos(cost),unit.factor));}catch(e){error=e instanceof Error?e.message:"Check the documented purchase cost.";}
 return <>
  <label className="field"><span id={hint}>Purchase-cost unit</span><select name="unit" aria-labelledby={hint} required value={unitId} onChange={e=>{setUnitId(e.target.value);setCost("");}}><option value="">Choose the unit on your document</option>{product.units.map(u=><option key={u.id} value={u.id}>{u.name} · {u.factor} {product.baseUnit}</option>)}</select></label>
  <label className="field"><span>Purchase cost per selected unit (₱)</span><input name="cost" inputMode="decimal" autoComplete="off" required value={cost} onChange={e=>setCost(e.target.value)}/></label>
  {unit&&<p>Documented cost must be for one {unit.name}, equal to {new Decimal(unit.factor).toFixed()} {product.baseUnit}. Changing this unit clears the entered cost.</p>}
  {preview&&<p role="status">This removal at the entered purchase cost: {preview} for {stockMeasurement(row.quantity,row.base_unit)}. Check the source document, then save and review the confirmed report value.</p>}
  {error&&<p role="alert" className="quantity-error">{error}</p>}
  <label className="field"><span>Purchase-cost document reference</span><input name="reference" required minLength={3} maxLength={200}/></label>
  <label className="checkbox"><input name="zero" type="checkbox"/>Document confirms zero acquisition cost</label>
 </>;
}

type Filters = { fromDate: string; throughDate: string; filter: string; allBranches: boolean };
export function StockLossReport({ db, organizationId, branchId, branchName, actorId, products, owner, online, disabled, revision, execute }: {
  db: PosDatabase; organizationId: string; branchId: string; branchName: string; actorId: string; products: Product[];
  owner: boolean; online: boolean; disabled: boolean; revision: number; execute: (fn: () => Promise<void>) => Promise<Error | undefined>;
}) {
  const [draft, setDraft] = useState<Filters>(() => { const today = businessDay(); return { fromDate: today.slice(0, 7) + "-01", throughDate: today, filter: "loss", allBranches: false }; });
  const [filters, setFilters] = useState(draft), [data, setData] = useState<LossReport>(), [loading, setLoading] = useState(false), [error, setError] = useState(""), [feedback, setFeedback] = useState("");
  const id = useId(), generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async (mode: "reset" | "losses" | "reconciliation" = "reset", previous?: LossReport) => {
    const request = ++generation.current; setLoading(true);
    try {
      // A failed filter change retains the old report. Its next page must retain
      // that report's filters as well as its timestamp, never the failed request.
      const applied = previous ? { fromDate: previous.fromDate, throughDate: previous.throughDate, filter: previous.filter, allBranches: previous.allBranches } : filters;
      const result = await command<LossReport>("stock_loss_report", { organizationId, branchId, ...applied, ...(previous ? { asOf: previous.asOf } : {}), ...(mode === "losses" ? { cursor: previous?.next } : {}), ...(mode === "reconciliation" ? { reconciliationCursor: previous?.reconciliationNext } : {}) });
      if (request !== generation.current) return;
      setData(old => ({ ...result, rows: mode === "reconciliation" ? old?.rows ?? result.rows : mode === "losses" ? [...old?.rows ?? [], ...result.rows] : result.rows,
        next: mode === "reconciliation" ? old?.next ?? null : result.next,
        reconciliation: mode === "losses" ? old?.reconciliation ?? result.reconciliation : mode === "reconciliation" ? [...old?.reconciliation ?? [], ...result.reconciliation] : result.reconciliation,
        reconciliationNext: mode === "losses" ? old?.reconciliationNext ?? null : result.reconciliationNext }));
      setError("");
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : "Could not load the stock-loss report. Reconnect and retry."); }
    finally { if (request === generation.current) setLoading(false); }
  }, [organizationId, branchId, filters]);
  useEffect(() => { if (online) void load(); else setLoading(false); return invalidate; }, [online, load, revision, invalidate]);
  const blocked = disabled || loading || !online;
  const scope = data?.allBranches ? "All branches" : branchName;
  async function recordCost(row: LossRow, reason: string, fields: FormData) {
    await onlineOperation(db, actorId, "record_loss_cost", { organizationId, branchId: row.branch_id, lossKey: row.loss_key, expectedCostId: row.evidence_id,
      unitId: String(fields.get("unit") ?? ""), unitCostCentavos: purchaseCentavos(String(fields.get("cost") ?? "")), zeroCostConfirmed: fields.get("zero") === "on",
      reference: String(fields.get("reference") ?? "").trim(), reason }, "costEvidenceId");
    setFeedback("Purchase-cost evidence saved. Previous versions and stock quantities are unchanged.");
    await load();
  }
  return <>
    <section className="panel stock-loss-report">
      <div className="section-heading"><h2>Stock loss at purchase cost</h2><Button variant="outline" disabled={blocked} onClick={() => void load()}>Refresh stock-loss report</Button></div>
      <p>Posted shortages and write-offs are valued using owner-documented purchase costs. A missing cost stays unvalued. This report does not establish the cause of a shortage.</p>
      <form className="form-grid" aria-label="Stock-loss report filters" onSubmit={e => { e.preventDefault(); try { historyBounds({ from: draft.fromDate, to: draft.throughDate }); setFilters({ ...draft }); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Check the report dates."); } }}>
        <label className="field"><span>Loss report from date</span><input type="date" value={draft.fromDate} onChange={e => setDraft({ ...draft, fromDate: e.target.value })} /></label>
        <label className="field"><span>Loss report through date</span><input type="date" value={draft.throughDate} onChange={e => setDraft({ ...draft, throughDate: e.target.value })} /></label>
        <label className="field"><span id={`${id}-category`}>Removal category</span><select aria-labelledby={`${id}-category`} value={draft.filter} onChange={e => setDraft({ ...draft, filter: e.target.value })}><option value="loss">Posted losses / write-offs</option><option value="other_removal">Authorised use / supplier returns</option><option value="all">All recorded removals</option></select></label>
        {owner && <label className="checkbox"><input type="checkbox" checked={draft.allBranches} onChange={e => setDraft({ ...draft, allBranches: e.target.checked })} />Report all branches</label>}
        <Button disabled={blocked}>Apply loss-report filters</Button>
      </form>
      {feedback && <p className="notice success" role="status">{feedback}</p>}
      {error && <p className="notice error" role="alert">{error} Previously loaded report rows are retained. Refresh online to retry.</p>}
      {!online && <p className="notice">Reconnect for current loss and cost records. Loaded rows retain their original snapshot time.</p>}
      {loading && <p role="status">Loading stock-loss report…</p>}
      {data ? <>
        <p>{scope} · Stock-book recorded dates, Asia/Manila: {data.fromDate || "earliest"} through {data.throughDate || "latest"}. Snapshot: {stamp(data.asOf)}.</p>
        <p>Category shown: {data.filter.replaceAll("_", " ")}. Cost basis: documented purchase cost per selected unit, converted to base quantity and rounded once per row. Liquid quantities also show ml. Use the documented cost of one selected purchase unit; each complete removal is valued and rounded once. This is an operational report, not a full inventory-cost accounting system.</p>
        <div className="loss-report-totals" aria-label="Full-range loss valuation totals">
          <p><strong>Documented-cost loss subtotal: {reportMoney(data.totals.documentedLossCentavos)}</strong><br />{data.totals.lossRows} posted loss rows in the complete range.</p>
          <p className={data.totals.missingLossCosts ? "quantity-error" : ""}>{data.totals.missingLossCosts ? `Incomplete valuation: ${data.totals.missingLossCosts} loss rows have no documented purchase cost. They are not valued at zero.` : "Every posted loss row in this range has documented cost evidence."}</p>
          <p>Other authorised removals: {reportMoney(data.totals.documentedOtherCentavos)} documented · {data.totals.otherRows} rows · {data.totals.missingOtherCosts} unvalued. This amount is separate from the loss subtotal.</p>
        </div>
        <p>Held goods, pending counts, unreceived transfers and supplier-document shortfalls are not automatically posted losses. Review them in Inventory. Transfer shortages are attributed to the dispatch branch; disposing held goods is recorded once at the branch holding them.</p>
        {data.rows.length ? <div className="table-wrap history-table loss-table" role="region" aria-label="Purchase-cost stock-loss rows" tabIndex={0}><table role="table"><thead><tr><th scope="col">Product / lot / source</th><th scope="col">Removed quantity</th><th scope="col">Documented value / evidence</th></tr></thead><tbody>{data.rows.map(row => {
          const product = products.find(p => p.id === row.product_id);
          return <tr key={`${row.loss_key}:${row.evidence_id ?? "missing"}`}>
            <td><strong>{row.product_name}</strong><small>{row.branch_name} · Lot: {row.lot}</small><small>{row.category.replaceAll("_", " ")} · {stamp(row.recorded_at)}</small><p className="stock-evidence">{row.reason}</p><small>Source: {row.source_id} · Row: {row.loss_key}</small>{row.destination_branch_id && <small>Destination branch ID: {row.destination_branch_id}</small>}</td>
            <td className="numeric" data-label="Removed quantity: ">{stockMeasurement(row.quantity,row.base_unit)}</td>
            <td><strong>{reportMoney(row.value_centavos)}</strong>{row.evidence_id ? <>
              <p>{reportMoney(row.unit_cost_centavos)} / {row.unit_name} · {new Decimal(row.unit_factor!).toFixed()} {row.base_unit} per unit</p>
              {row.zero_cost_confirmed && row.unit_cost_centavos === "0" && <p>Document confirms zero acquisition cost.</p>}
              <p className="stock-evidence">Document: {row.reference}<br />{row.cost_reason}</p><small>{row.recorded_name} · {stamp(row.cost_recorded_at!)}</small>
            </> : <p>Owner: verify the supplier or opening-stock document before recording cost.</p>}
            {owner && product && <ApprovalForm action={row.evidence_id ? "Record corrected purchase cost" : "Record purchase cost"} label="Purchase-cost explanation" description="Enter the documented cost of ONE selected unit. Include allocated acquisition costs only when supported by your source. This changes the report valuation, not stock or the original sale." confirmLabel="Save cost evidence" disabled={blocked} onConfirm={(reason, fields) => execute(() => recordCost(row, reason, fields))}>
              <CostEvidenceFields product={product} row={row} hint={`${id}-unit-${row.loss_key}`}/>
            </ApprovalForm>}
            <CostHistory organizationId={organizationId} row={row} asOf={data.asOf} online={online} />
            </td>
          </tr>;
        })}</tbody></table></div> : <p>No posted removals match this report. This does not prove that physical stock has no unrecorded shortage.</p>}
        <div className="loss-report-actions"><Button variant="outline" disabled={blocked || !data.next} onClick={() => void load("losses", data)}>Load more loss rows</Button><Button variant="outline" disabled={loading || !data.rows.length} onClick={() => downloadCsv("stock-loss-loaded-rows.csv", lossCsv(data, scope))}>Export loaded loss rows (CSV)</Button></div>
        <p>{data.rows.length} loss/removal rows loaded. {data.next ? "More matching rows are available." : "End of matching removals."} Totals above cover the complete range; CSV contains only loaded rows. Keep exported records private.</p>
      </> : !loading && <p>Connect to load the report.</p>}
    </section>
    {data && <section className="panel stock-loss-report">
      <h2>Stock reconciliation</h2><p>{scope} · Same recorded-date range and snapshot as the loss report. Starting quantity plus the signed movements equals closing book quantity. Held goods and outstanding dispatch are separate balances; do not add them into that equation.</p>
      {data.reconciliation.length ? <div className="table-wrap history-table" role="region" aria-label="Stock-loss quantity reconciliation" tabIndex={0}><table><thead><tr><th scope="col">Branch / product / lot</th>{reconciliationQuantities.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{data.reconciliation.map(row => <tr key={`${row.branch_id}:${row.product_id}:${row.batch_id ?? "none"}`}><td><strong>{row.product_name}</strong><small>{row.branch_name} · {row.lot} · {row.base_unit}</small></td>{reconciliationQuantities.map(([key]) => <td className="numeric" key={key}>{new Decimal(row[key]).toFixed()}</td>)}</tr>)}</tbody></table></div> : <p>No stock-book movements match this cutoff.</p>}
      <div className="loss-report-actions"><Button variant="outline" disabled={blocked || !data.reconciliationNext} onClick={() => void load("reconciliation", data)}>Load more stock reconciliation</Button><Button variant="outline" disabled={loading || !data.reconciliation.length} onClick={() => downloadCsv("stock-reconciliation-loaded-rows.csv", reconciliationCsv(data, scope))}>Export loaded reconciliation (CSV)</Button></div>
      <p>{data.reconciliation.length} product/lot rows loaded. {data.reconciliationNext ? "More stock rows are available." : "End of stock reconciliation."} Quantities from different base units are not combined into a single total.</p>
    </section>}
  </>;
}
