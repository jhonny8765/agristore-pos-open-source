"use client";
import {useId,useState} from "react";
import {correctionCashCentavos,money,type RefundCorrectionPlan,type RefundHistoryRow} from "@agristore/domain";
import {PosDatabase,unresolvedStates} from "@agristore/offline";
import {command} from "../lib/api";
import {onlineOperation,pendingOperations} from "../lib/operations";
import {ApprovalForm} from "./approval-form";
import {Button} from "./ui/button";
export function RefundCorrectionControl({refund,db,organizationId,branchId,saleId,actorId,shiftId,disabled,readDisabled,execute,onSaved,onPrepare}:{refund:RefundHistoryRow;db:PosDatabase;organizationId:string;branchId:string;saleId:string;actorId:string;shiftId?:string;disabled:boolean;readDisabled:boolean;execute:(fn:()=>Promise<void>)=>Promise<Error|undefined|void>;onSaved:()=>Promise<void>;onPrepare:(refund:RefundHistoryRow)=>void}){
 const [plan,setPlan]=useState<RefundCorrectionPlan>(),[error,setError]=useState(""),[loading,setLoading]=useState(false),[cash,setCash]=useState(""),[reference,setReference]=useState("");const hint=useId();
 const ctx={organizationId,branchId,saleId,refundId:refund.id,refundKind:refund.kind,shiftId};
 if(refund.correction)return <div className="refund-correction"><strong>Original refund undone · {money(refund.correction.amount)} cash recovered / retained</strong><p>{refund.correction.reference} · {refund.correction.reason}</p><small>Correction ID: {refund.correction.id}</small>{refund.correction.replacementId?<p>Linked replacement refund: {refund.correction.replacementId}</p>:refund.evidenceComplete&&<Button size="sm" variant="outline" disabled={disabled} onClick={()=>onPrepare(refund)}>Prepare corrected refund</Button>}<p>The original refund and its drawer record remain. Any recovered cash belongs to the correcting shift.</p></div>;
 return <div className="refund-correction">
  <Button size="sm" variant="outline" disabled={readDisabled||loading} onClick={async()=>{setLoading(true);setError("");try{setPlan(await command<RefundCorrectionPlan>("refund_correction_check",ctx));}catch(e){setError(e instanceof Error?e.message:"Reconnect and check the original refund.");}finally{setLoading(false);}}}>{loading?"Checking correction…":"Check mistaken refund"}</Button>
  {error&&<p role="alert" className="notice error">{error}</p>}
  {plan&&<><p>This undoes the entire original refund. Account for <strong>{money(plan.cashToRestore)}</strong> in full, either recovered from the customer or never handed out. A partial cash recovery needs owner reconciliation.</p>
   {plan.effects.map(e=><p key={e.product_id+e.batch_id}>{e.product_name} · {e.batch_id?`Lot ${e.batch_id}`:"No lot"}<br/>Remove saleable: {e.saleable_to_remove} {e.base_unit} · Cancel held: {e.held_to_cancel} {e.base_unit}<br/>Saleable stock: {e.book_before} → {e.book_after} {e.base_unit}</p>)}
   {!plan.eligible?<div role="status"><strong>Automatic correction blocked</strong><ul>{plan.reasons.map(r=><li key={r}>{r}</li>)}</ul><p>Keep the original refund. Have the owner reconcile the cash, goods and later records.</p></div>:<>
    <p>Stop branch sales, clear and synchronize every cashier PC, and close other shifts first. Remove only the goods credited by this refund from store custody. Do not remove a real customer return that the store still owns.</p>
    <ApprovalForm action="Authorize refund correction" label="Refund correction reason and evidence" description="The original refund stays recorded. This adds recovered cash to your current drawer, reverses its saleable stock additions and cancels untouched held returns. If the original refund was correct but goods are now missing, investigate the shortage instead." confirmLabel="Confirm refund correction" disabled={disabled||loading} onConfirm={async(reason,f)=>{
     if(reason.length<10)return new Error("Describe the mistake and cash / goods evidence in at least ten characters.");
     let amount:number;try{amount=correctionCashCentavos(cash.trim());if(amount!==plan.cashToRestore)throw new Error("Account for the full original refund amount before correcting it.");if(reference.trim().length<3)throw new Error("Enter a correction reference with at least three characters.");}catch(e){return e instanceof Error?e:new Error("Check the correction details.");}
     const failure=await execute(async()=>{if(!shiftId)throw new Error("Open your own shift before recording recovered refund cash.");if(await db.sales.where("status").anyOf(unresolvedStates).count()>0||(await pendingOperations(db)).length>0)throw new Error("Resolve pending sales and saved requests in Sync center before correcting a refund.");await onlineOperation(db,actorId,"correct_refund",{...ctx,expectedLedgerRevision:plan.ledgerRevision,expectedRefundVersion:plan.refundVersion,cashRestoredCentavos:amount,reference:reference.trim(),reason,cashConfirmed:f.get("cash")==="on",goodsConfirmed:f.get("goods")==="on",queuesConfirmed:f.get("queues")==="on"},"correctionId");});
     if(failure)return failure;setPlan(undefined);setCash("");setReference("");await onSaved();
    }}>
     <label className="field"><span>Cash recovered or retained (₱)</span><input inputMode="decimal" required value={cash} onChange={e=>setCash(e.target.value)} aria-describedby={hint}/></label><small id={hint}>Enter the full amount you have physically accounted for. A saved record cannot verify actual cash.</small>
     <label className="field"><span>Refund correction reference</span><input required minLength={3} maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></label>
     <label className="checkbox"><input name="cash" type="checkbox" required/>I accounted for the entire refund cash in this drawer.</label>
     <label className="checkbox"><input name="goods" type="checkbox" required/>I checked the actual goods and the stock changes shown above.</label>
     <label className="checkbox"><input name="queues" type="checkbox" required/>All branch cashier PCs are synchronized, their baskets cleared, and other shifts closed.</label>
    </ApprovalForm>
   </>}
  </>}
 </div>;
}
