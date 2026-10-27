import {describe,it,expect} from "vitest";
import {partialRefundPreview,refundAllocation,type PartialRefundPlan,type PartialRefundLine} from "@agristore/domain";
const line:PartialRefundLine={lineIndex:0,productId:"p",unitId:"u",batchId:null,name:"TEST feeds",unitName:"Sack",quantity:"0.3",factor:"50",unitPrice:333,unitCost:100,priceVersion:1,lineTotal:100,baseUnit:"kg",saleableAllowed:true,refundedQuantity:"0",remainingQuantity:"0.3",refundedAmount:0};
const plan=(l=line):PartialRefundPlan=>({saleId:"s",receipt:"TEST",version:0,total:l.lineTotal,refundedCash:l.refundedAmount,remainingCash:l.lineTotal-l.refundedAmount,fullyRefunded:false,lines:[l]});
const item={lineIndex:0,quantity:"0.1",returnedQuantity:"0",disposition:"not_returned" as const};
describe("original-price partial refunds",()=>{
 it("assigns cumulative centavos as 33, 34, 33 without over-refunding",()=>{let l={...line};const values=[];for(let n=0;n<3;n++){const a=refundAllocation(l,"0.1");values.push(a);l={...l,refundedQuantity:["0.1","0.2","0.3"][n],remainingQuantity:["0.2","0.1","0"][n],refundedAmount:l.refundedAmount+a};}expect(values).toEqual([33,34,33]);});
 it("uses the paid line allocation even when the current catalog would differ",()=>expect(refundAllocation({...line,unitPrice:999999},"0.1")).toBe(33));
 it("splits physical returns between saleable and held base quantities",()=>{const p=partialRefundPreview(plan(),[{...item,returnedQuantity:"0.1",disposition:"mixed",resalableQuantity:"0.04"}]);expect(p.amount).toBe(33);expect(p.items[0]).toMatchObject({saleableBase:"2",heldBase:"3"});});
 it("does not restock goods that were not returned",()=>expect(partialRefundPreview(plan(),[item]).items[0]).toMatchObject({saleableBase:"0",heldBase:"0"}));
 it("refuses remaining-quantity and duplicate-line overclaims",()=>{expect(()=>partialRefundPreview(plan(),[{...item,quantity:"0.4"}])).toThrow(/unrefunded/);expect(()=>partialRefundPreview(plan(),[item,item])).toThrow(/only once/);});
 it("rejects fractional piece returns and physical excess",()=>{expect(()=>partialRefundPreview(plan({...line,baseUnit:"piece",factor:"1"}),[item])).toThrow(/whole/);expect(()=>partialRefundPreview(plan(),[{...item,returnedQuantity:"0.2",disposition:"hold"}])).toThrow(/within/);});
 it("requires held disposition for expired returned goods",()=>{expect(()=>partialRefundPreview(plan({...line,saleableAllowed:false}),[{...item,returnedQuantity:"0.1",disposition:"resalable"}])).toThrow(/Expired/);expect(partialRefundPreview(plan({...line,saleableAllowed:false}),[{...item,returnedQuantity:"0.1",disposition:"hold"}]).items[0].heldBase).toBe("5");});
 it("rejects nondecimal input and excessive stock precision",()=>{for(const q of ["NaN","1e-1","-1","0.0000001",""]){expect(()=>refundAllocation(line,q)).toThrow();}expect(()=>partialRefundPreview(plan({...line,factor:"0.000001"}),[item])).toThrow(/precision/);});
 it("can allocate zero cash on a tiny portion without losing the final centavo",()=>{const l={...line,lineTotal:1,quantity:"3",factor:"1",remainingQuantity:"3"};expect(refundAllocation(l,"1")).toBe(0);expect(refundAllocation({...l,refundedQuantity:"1",remainingQuantity:"2"},"2")).toBe(1);});
 it("retains exact integer centavos near the safe numeric limit",()=>{const l={...line,lineTotal:9007199254740990,quantity:"1",remainingQuantity:"1"};expect(refundAllocation(l,"0.5")).toBe(4503599627370495);});
});

import {correctionCashCentavos} from "@agristore/domain";
describe("full recovered cash input",()=>{
 it.each([["0",0],["365.00",36500],["0.01",1],["90071992547409.91",9007199254740991]])("converts %s without losing a centavo",(s,n)=>expect(correctionCashCentavos(String(s))).toBe(n));
 it.each(["", "NaN", "-1", "1e2", "1.001", "90071992547409.92"])("rejects unsafe cash %s",s=>expect(()=>correctionCashCentavos(s)).toThrow());
});
