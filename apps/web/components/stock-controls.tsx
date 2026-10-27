"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { stockMeasurement } from "../lib/stock-quantity";
import { MeasuredQuantity } from "./measured-quantity";
import type { Product } from "@agristore/domain";
import type { PosDatabase } from "@agristore/offline";
import { command } from "../lib/api";
import { onlineOperation } from "../lib/operations";
import { stockControlIdentity } from "../lib/stock-controls";
import { ApprovalForm } from "./approval-form";
import { Button } from "./ui/button";
import { StockFollowUps } from "./stock-followups";

type Row = Record<string,unknown>;
interface Controls { openExceptions: number; exceptions: Row[]; holds: Row[]; issues: Row[]; holdCount?:number; issueCount?:number; holdsNext?:{at:string;id:string}|null; issuesNext?:{at:string;id:string}|null }
const val = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
export function StockControls({db, organizationId, branchId, actorId, products, owner, canAssign, online, disabled, revision, execute}: {
  db: PosDatabase; organizationId: string; branchId: string; actorId: string; products: Product[];
  owner: boolean; canAssign: boolean; online: boolean; disabled: boolean; revision: number;
  execute: (fn: () => Promise<void>) => Promise<Error | undefined>;
}) {
  const [data,setData] = useState<Controls>();
  const [issueStock,setIssueStock] = useState("");
  const issueOptions=products.flatMap(p=>p.batches.length?p.batches.map(b=>`${p.id}:${b.id}`):[`${p.id}:none`]);
  const issueSelection=issueOptions.includes(issueStock)?issueStock:issueOptions[0]??"";
  const issueProduct=products.find(p=>p.id===issueSelection.split(":")[0]);
  const [error,setError] = useState("");
  const [feedback,setFeedback] = useState("");
  const [loading,setLoading] = useState(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; },[]);
  const context = {organizationId,branchId};
  const load = useCallback(async (mode:"reset"|"holds"|"issues"="reset",previous?:Controls) => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const next = await command<Controls>("stock_controls",{organizationId,branchId,...(mode==="holds"?{holdCursor:previous?.holdsNext}:{}),...(mode==="issues"?{issueCursor:previous?.issuesNext}:{})});
      if (request === generation.current) { setData(old=>mode==="reset"?next:{...next,holds:mode==="holds"?[...old?.holds??[],...next.holds]:old?.holds??next.holds,holdsNext:mode==="holds"?next.holdsNext:old?.holdsNext,issues:mode==="issues"?[...old?.issues??[],...next.issues]:old?.issues??next.issues,issuesNext:mode==="issues"?next.issuesNext:old?.issuesNext}); setError(""); }
    } catch(e) { if(request === generation.current) setError(e instanceof Error ? e.message : "Could not refresh stock controls. Retry online."); }
    finally { if(request===generation.current)setLoading(false); }
  },[organizationId,branchId]);
  useEffect(() => {
    if (online) void load(); else setLoading(false);
    return invalidate;
  },[online,load,revision,invalidate]);
  const label = (row: Row) => {
    const product = stockControlIdentity(products,row);
    return `${product.name} · ${product.lot} (${product.baseUnit || "base units"})`;
  };
  async function save(action: string, body: Row, idField?: string) {
    if (idField) await onlineOperation(db,actorId,action,{...context,...body},idField);
    else await command(action,{...context,...body});
    setFeedback("Stock control recorded. The original history is retained.");
    await load();
  }
  return <>
    <StockFollowUps {...{db, organizationId, branchId, actorId, products, owner, canAssign, online, disabled, revision, execute}} />
    <section className="panel">
      <div className="section-heading"><h2>Held goods · excluded from saleable stock</h2><Button variant="outline" disabled={!online || disabled || loading} onClick={() => void load()}>Refresh stock controls</Button></div>
      {feedback && <p role="status" className="notice success">{feedback}</p>}
      {error && <p role="alert" className="notice error">{error}</p>}
      {loading&&<p role="status">Loading stock controls…</p>}
      {!online&&<p className="notice">Reconnect and refresh before acting. Previously loaded stock controls may have changed.</p>}
      <p>Keep these goods physically separate. Inspect them before release; expired goods cannot be released for sale.</p>
      {!data?.holds.length ? <p>No held goods loaded.</p> : <div className="table-wrap history-table stock-control-table" role="region" aria-label="Held stock" tabIndex={0}><table role="table"><thead><tr><th scope="col">Product / lot / reason</th><th scope="col" className="numeric">Still held</th><th scope="col">Outcome</th></tr></thead><tbody>
        {data.holds.map(h => <tr key={String(h.id)}><td>{label(h)}<small>{String(h.reason)}</small></td><td className="numeric" data-label="Still held: ">{stockMeasurement(h.remaining,stockControlIdentity(products,h).baseUnit||"base units")}</td><td>{owner ? <ApprovalForm action="Record held-goods outcome" label="Inspection / disposition reason" description="Release only goods verified saleable. Disposal or supplier return does not deduct saleable stock again." confirmLabel="Record outcome" disabled={disabled || !online || !stockControlIdentity(products,h).baseUnit} onConfirm={(reason,f) => execute(() => save("disposition_hold",{holdId:h.id,quantity:val(f,"quantity"),disposition:val(f,"disposition"),reason},"dispositionId"))}>
          <MeasuredQuantity label="Quantity from held stock (base units)" entryLabel="Quantity from held stock" name="quantity" measurement={{baseUnit:stockControlIdentity(products,h).baseUnit||"base units",unitName:stockControlIdentity(products,h).baseUnit||"base units",factor:"1"}} positive max={String(h.remaining)}/>
          <label className="field"><span id={`held-outcome-${h.id}`}>Held-goods outcome</span><select name="disposition" aria-labelledby={`held-outcome-${h.id}`} defaultValue="dispose"><option value="dispose">Dispose / write off held goods</option><option value="supplier_return">Return held goods to supplier</option><option value="release">Release inspected goods for sale</option></select></label>
        </ApprovalForm> : "Owner review required"}{owner&&!stockControlIdentity(products,h).baseUnit&&<p>Measurement is unavailable. Refresh online before processing these goods.</p>}</td></tr>)}
      </tbody></table></div>}
      {data&&<><p>{data.holds.length} of {data.holdCount??data.holds.length} open held-goods records loaded, oldest first. {data.holdsNext?"More held goods are available.":"End of open held goods."} Refresh to check current balances.</p><Button variant="outline" disabled={disabled||!online||loading||!data.holdsNext} onClick={()=>void load("holds",data)}>Load more held goods</Button></>}
    </section>
    <section className="panel">
      <h2>Damage, spillage and other stock issues</h2>
      <p>Choose the actual measurement and check its recorded stock equivalent. Nothing changes saleable stock until the owner approves. Do not use this to erase an unexplained count difference.</p>
      {!!data?.issues.length && <div className="table-wrap history-table stock-control-table" role="region" aria-label="Stock issues awaiting approval" tabIndex={0}><table role="table"><thead><tr><th scope="col">Issue</th><th scope="col" className="numeric">Quantity</th><th scope="col">Approval</th></tr></thead><tbody>{data.issues.map(s => <tr key={String(s.id)}><td>{label(s)}<small>{String(s.category)} · {String(s.disposition)} · {String(s.reason)}</small></td><td className="numeric" data-label="Quantity: ">{stockMeasurement(s.quantity,stockControlIdentity(products,s).baseUnit||"base units")}</td><td>{owner && <ApprovalForm action="Approve stock issue" label="Approval notes" description="This deducts the recorded quantity from saleable stock and retains a separate movement. Held goods remain separately tracked." confirmLabel="Approve issue" disabled={disabled || !online} onConfirm={reason => execute(() => save("approve_stock_issue",{issueId:s.id,reason}))} />}</td></tr>)}</tbody></table></div>}
      {data&&<><p>{data.issues.length} of {data.issueCount??data.issues.length} pending stock issues loaded, oldest first. {data.issuesNext?"More pending issues are available.":"End of pending stock issues."}</p><Button variant="outline" disabled={disabled||!online||loading||!data.issuesNext} onClick={()=>void load("issues",data)}>Load more stock issues</Button></>}
      <form className="form-grid" aria-label="Record stock issue" onSubmit={e => {
        e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
        const [productId,batch] = val(f,"stock").split(":");
        void execute(async () => { await onlineOperation(db,actorId,"record_stock_issue",{...context,productId,batchId:batch === "none" ? null : batch,quantity:val(f,"quantity"),category:val(f,"category"),disposition:val(f,"disposition"),reason:val(f,"reason")},"issueId"); form.reset(); setIssueStock(""); setFeedback("Issue submitted for owner approval. Stock has not changed."); await load(); });
      }}>
        <label className="field"><span id={`issue-stock-${branchId}`}>Product / lot for stock issue</span><select name="stock" aria-labelledby={`issue-stock-${branchId}`} required value={issueSelection} onChange={e=>setIssueStock(e.target.value)}>{products.flatMap(p => p.batches.length ? p.batches.map(b => <option key={b.id} value={`${p.id}:${b.id}`}>{p.name} · {b.lot} ({p.baseUnit})</option>) : [<option key={p.id} value={`${p.id}:none`}>{p.name} ({p.baseUnit})</option>])}</select></label>
        <MeasuredQuantity key={`${branchId}:${issueSelection}`} label="Issue quantity (base units)" entryLabel="Issue quantity" name="quantity" measurement={{baseUnit:issueProduct?.baseUnit??"base units",unitName:issueProduct?.baseUnit??"base units",factor:"1"}} positive disabled={disabled||!online||!issueProduct}/>
        <label className="field"><span id={`issue-category-${branchId}`}>Issue category</span><select name="category" aria-labelledby={`issue-category-${branchId}`}><option value="damage">Damaged goods</option><option value="spillage">Spillage</option><option value="expiry">Expired goods</option><option value="supplier_return">Supplier return</option><option value="staff_use">Staff use</option><option value="owner_use">Owner use</option><option value="unexplained">Unexplained shortage</option></select></label>
        <label className="field"><span id={`issue-disposition-${branchId}`}>Physical disposition</span><select name="disposition" aria-labelledby={`issue-disposition-${branchId}`}><option value="hold">Remove from sale and hold separately</option><option value="write_off">Goods consumed, missing or disposed</option></select></label>
        <label className="field"><span>Issue evidence / reason</span><input name="reason" required minLength={3} maxLength={1000} /></label>
        <Button disabled={disabled || !online || !products.length}>Submit stock issue</Button>
      </form>
    </section>
  </>;
}
