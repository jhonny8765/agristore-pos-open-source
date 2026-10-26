import Decimal from "decimal.js";
import type { SaleItem } from "./index";
const Exact=Decimal.clone({precision:80,rounding:Decimal.ROUND_HALF_UP});
export interface PartialRefundLine extends SaleItem {lineIndex:number;baseUnit:string;saleableAllowed:boolean;refundedQuantity:string;remainingQuantity:string;refundedAmount:number}
export interface PartialRefundPlan {saleId:string;receipt:string;version:number;total:number;refundedCash:number;remainingCash:number;fullyRefunded:boolean;lines:PartialRefundLine[]}
export interface PartialRefundItem {lineIndex:number;quantity:string;returnedQuantity:string;disposition:"resalable"|"hold"|"mixed"|"not_returned";resalableQuantity?:string}
export function refundAllocation(line:PartialRefundLine,quantity:string){
  const q=exactQuantity(quantity);
  if(q.lte(0)||q.gt(line.remainingQuantity))throw new Error("Refund quantity exceeds the original unrefunded quantity.");
  const amount=new Exact(line.lineTotal).times(new Exact(line.refundedQuantity).plus(q)).div(line.quantity).toDecimalPlaces(0).minus(line.refundedAmount);
  if((!amount.isInteger()||amount.gt(Number.MAX_SAFE_INTEGER))||amount.lt(0))throw new Error("Refund allocation is inconsistent. Refresh the original sale.");
  return amount.toNumber();
}
function exactQuantity(s:string){if(!/^\d{1,14}(?:\.\d{1,6})?$/.test(s))throw new Error("Use exact nonnegative quantities with at most six decimal places.");return new Exact(s);}
export function partialRefundPreview(plan:PartialRefundPlan,items:PartialRefundItem[]){
 if(!items.length||items.length>100)throw new Error("Enter a refund quantity for at least one original sale line.");
 if(new Set(items.map(i=>i.lineIndex)).size!==items.length)throw new Error("Each original line can appear only once.");
 const rows=items.map(item=>{
  const line=plan.lines.find(l=>l.lineIndex===item.lineIndex);if(!line)throw new Error("Select an original sale line.");
  const q=exactQuantity(item.quantity),t=exactQuantity(item.returnedQuantity),f=new Exact(line.factor);
  if(t.gt(q)||q.times(f).decimalPlaces()>6||t.times(f).decimalPlaces()>6)throw new Error("Returned quantities must stay within the selected refund quantity and stock precision.");
  if(!["resalable","hold","mixed","not_returned"].includes(item.disposition)||(t.eq(0)&&item.disposition!=="not_returned")||(t.gt(0)&&item.disposition==="not_returned"))throw new Error("Choose the physical disposition; use no goods returned only with zero returned quantity.");
  const a=item.disposition==="resalable"?t:item.disposition==="mixed"?exactQuantity(item.resalableQuantity??""):new Exact(0),h=t.minus(a);
  if(h.lt(0)||a.times(f).decimalPlaces()>6||h.times(f).decimalPlaces()>6)throw new Error("Saleable and held portions must equal the physical returned quantity.");
  if(line.baseUnit==="piece"&&[q,a,h].some(n=>!n.times(f).isInteger()))throw new Error("Piece stock must be a whole number.");
  if(a.gt(0)&&!line.saleableAllowed)throw new Error("Expired returns must be held, not restored to saleable stock.");
  return {...item,name:line.name,unitName:line.unitName,baseUnit:line.baseUnit,saleableBase:a.times(f).toFixed(),heldBase:h.times(f).toFixed(),amount:refundAllocation(line,item.quantity)};
 });
 const amount=rows.reduce((sum,r)=>sum.plus(r.amount),new Exact(0));if(amount.gt(plan.remainingCash))throw new Error("Refund exceeds the original remaining cash amount.");
 return {amount:amount.toNumber(),items:rows};
}
