"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { command } from "../lib/api";
import type { DeliveryInspection, DeliveryReversalPlan } from "../lib/purchasing";
import { ApprovalForm } from "./approval-form";
import { Button } from "./ui/button";
const qty=(s:string)=>new Decimal(s).toFixed();
export function DeliveryReversalControl({organizationId,branchId,row,online,disabled,localBlocked,onReverse,onCorrect}:{
  organizationId:string;branchId:string;row:DeliveryInspection;online:boolean;disabled:boolean;localBlocked:boolean;
  onReverse:(fields:Record<string,unknown>)=>Promise<Error|undefined>;onCorrect:()=>void;
}){
  const [plan,setPlan]=useState<DeliveryReversalPlan>(),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function check(){setLoading(true);setError("");try{setPlan(await command<DeliveryReversalPlan>("delivery_reversal_check",{organizationId,branchId,receiptId:row.id}));}catch(e){setError(e instanceof Error?e.message:"Reconnect and check this delivery again.");}finally{setLoading(false);}}
  if(row.reversal)return <div className="delivery-reversal"><strong>Reversed mistaken entry</strong><p>{row.reversal.reference} · {row.reversal.reason}</p><small>{new Date(row.reversal.created_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})} · Reversal ID: {row.reversal.id}</small><p>{row.reversal.reopenedOrder?"The linked purchase order was reopened.":"The linked order kept its appropriate existing status."} Original quantities below are historical evidence, not active receiving.</p>{row.correctionId?<p>Linked corrected delivery ID: {row.correctionId}. If it also needs correction, open that delivery.</p>:<Button variant="outline" size="sm" disabled={!online||disabled||localBlocked} onClick={onCorrect}>Prepare corrected delivery</Button>}</div>;
  return <div className="delivery-reversal">
    <Button size="sm" variant="outline" disabled={!online||disabled||loading||localBlocked} onClick={()=>void check()}>{plan?"Recheck delivery reversal":"Check delivery reversal"}</Button>
    {localBlocked&&<p>Finish the basket, close the cashier shift and resolve pending records before reversing.</p>}{loading&&<p role="status">Checking current stock and order history…</p>}{error&&<p role="alert" className="notice error">{error}</p>}
    {plan&&<><p>Only a full, untouched inspected delivery can be reversed. Later stock movements, physical counts, held-goods outcomes or supplier-claim activity block automatic reversal.</p>
      {plan.effects.map(e=><p key={`${e.product_id}:${e.batch_id??"none"}`}><strong>{e.product_name}</strong> · Lot ID: {e.batch_id??"No lot"}<br/>Remove saleable: {qty(e.saleable_to_remove)} {e.base_unit} · Cancel held: {qty(e.held_to_cancel)} {e.base_unit}<br/>Book quantity: {qty(e.book_before)} → {qty(e.book_after)} {e.base_unit}</p>)}
      {plan.reopensOrder&&<p className="notice">This reversal reopens the closed purchase order and restores only this delivery’s unreceived quantity.</p>}
      {!plan.eligible?<div role="status"><strong>Automatic reversal is blocked</strong><ul>{plan.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul><p>Preserve the source and use the owner’s physical reconciliation process. Do not enter another delivery to force the numbers to match.</p></div>:<ApprovalForm action="Reverse mistaken delivery" label="Delivery reversal evidence" description="This cancels the recorded stock effect; it does not physically return goods or issue credit. Check actual goods and every branch cashier PC first. The server rechecks the saved history before committing." confirmLabel="Confirm full delivery reversal" disabled={!online||disabled||loading||localBlocked||!!error} onConfirm={(reason,f)=>onReverse({receiptId:row.id,expectedLedgerRevision:plan.ledgerRevision,expectedOrderVersion:plan.orderVersion,reference:String(f.get("reference")??"").trim(),reason,physicalConfirmed:f.get("physical")==="on",queuesConfirmed:f.get("queues")==="on"})}>
        <label className="field"><span>Delivery correction reference</span><input name="reference" required minLength={3} maxLength={200}/></label>
        <label className="checkbox"><input name="physical" type="checkbox" required/>I checked the actual goods and this saved delivery is mistaken.</label>
        <label className="checkbox"><input name="queues" type="checkbox" required/>Every branch cashier PC is synchronized, with shifts closed and no unresolved sales.</label>
      </ApprovalForm>}
    </>}
  </div>;
}
