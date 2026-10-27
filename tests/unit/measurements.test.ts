import {describe,expect,it} from "vitest";
import {measuredQuantity,measurementDisplay,measurementEntries} from "@agristore/domain";
const liter={baseUnit:"liter",unitName:"Liter",factor:"1"},bottle={...liter,unitName:"500 ml container",factor:"0.5"},roll={baseUnit:"meter",unitName:"100 m roll",factor:"100"};
describe("stock workflow measurement entry",()=>{
 it.each([["250","ml",liter,"0.25","0.25"],["125","ml",bottle,"0.25","0.125"],["625","ml",{...bottle,factor:"2.5"},"0.25","0.625"],["12.75","base",roll,"0.1275","12.75"],["1/4","unit",{...roll,unitName:"Meter",factor:"1"},"0.25","0.25"],["0","ml",liter,"0","0"],["0.001","ml",liter,"0.000001","0.000001"]] as const)("converts %s %s exactly",(raw,mode,m,quantity,baseQuantity)=>expect(measuredQuantity(raw,mode,m)).toEqual({quantity,baseQuantity}));
 it("repeated switches cannot multiply a container or stock quantity",()=>{for(let i=0;i<20;i++){expect(measurementDisplay("0.25","ml",bottle)).toBe("125");expect(measuredQuantity("125","ml",bottle).quantity).toBe("0.25");expect(measurementDisplay("0.25","unit",bottle)).toBe("0.25");}});
 it.each(["", "NaN","Infinity","-1","1e2","1/3","1/0","0.0000001","100000000000000"])("rejects incomplete or unsafe %s",raw=>expect(()=>measuredQuantity(raw,"unit",liter)).toThrow());
 it("refuses rounding into a three-liter container or below stock precision",()=>{expect(()=>measuredQuantity("125","ml",{...liter,factor:"3"})).toThrow(/do not round/);expect(()=>measuredQuantity("0.000001","ml",liter)).toThrow(/do not round/);});
 it("keeps piece stock whole and makes zero explicit",()=>{const p={baseUnit:"piece",unitName:"Box",factor:"12"};expect(measuredQuantity("0.5","unit",p).baseQuantity).toBe("6");expect(()=>measuredQuantity("0.5","unit",{...p,factor:"1"})).toThrow(/whole/);expect(()=>measuredQuantity("0","ml",liter,true)).toThrow(/greater than zero/);});
 it("never offers ml for rope or pieces",()=>{expect(measurementEntries(roll).map(x=>x.value)).toEqual(["unit","base"]);expect(()=>measuredQuantity("250","ml",roll)).toThrow(/supported/);});
 it("does not lose decimals near the supported quantity limit",()=>{expect(measuredQuantity("99999999999.999","ml",liter).quantity).toBe("99999999.999999");expect(()=>measurementDisplay("99999999999999","ml",liter)).toThrow();});
});
