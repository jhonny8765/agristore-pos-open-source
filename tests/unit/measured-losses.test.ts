import {describe,it,expect} from "vitest";
import {measuredQuantity} from "@agristore/domain";
import {lossValueCentavos,purchaseCentavos,reportMoney} from "../../apps/web/lib/stock-loss";
import {stockMeasurement} from "../../apps/web/lib/stock-quantity";
describe("measured damage quantities and documented loss values",()=>{
 it("records 125 ml as 0.125 liter and values it against one 500 ml purchase unit",()=>{const q=measuredQuantity("125","ml",{baseUnit:"liter",unitName:"liter",factor:"1"},true);expect(q.quantity).toBe("0.125");expect(lossValueCentavos(q.quantity,purchaseCentavos("25"),"0.5")).toBe("625");});
 it("values a quarter meter from a documented 100 meter roll cost",()=>expect(lossValueCentavos(measuredQuantity("1/4","unit",{baseUnit:"meter",unitName:"meter",factor:"1"},true).quantity,"100000","100")).toBe("250"));
 it("keeps 25 ml supplier returns separate at the same documented unit cost",()=>expect(lossValueCentavos("0.025","2500","0.5")).toBe("125"));
 it("rounds once per whole loss row, never per milliliter",()=>{expect(lossValueCentavos("0.249","3","0.5")).toBe("1");expect(lossValueCentavos("0.25","3","0.5")).toBe("2");expect(lossValueCentavos("0.017","2999","0.5")).toBe("102");});
 it("distinguishes documented zero cost from an absent cost",()=>{expect(lossValueCentavos("0.25","0","0.5")).toBe("0");expect(reportMoney(null)).toBe("Cost not documented");expect(()=>lossValueCentavos("0.25","","0.5")).toThrow();});
 it("preserves large exact value strings above JavaScript integer precision",()=>expect(lossValueCentavos("99999999999999.999999","99999999999999","0.000001")).toBe("9999999999999899999900000000000001"));
 it("labels liquid quantities and signed report equivalents without changing them",()=>{expect(stockMeasurement("0.125000","liter")).toBe("0.125 liter (125 ml)");expect(stockMeasurement("-0.000001","liter")).toBe("-0.000001 liter (-0.001 ml)");});
 it("does not attach milliliters to rope, pieces or kilos",()=>{expect(stockMeasurement("0.250000","meter")).toBe("0.25 meter");expect(stockMeasurement("2","piece")).toBe("2 piece");expect(stockMeasurement("0.5","kg")).toBe("0.5 kg");});
 it("rejects invalid, zero or overly precise physical issue amounts",()=>{for(const q of ["0","-1","NaN","0.0000001"])expect(()=>measuredQuantity(q,"unit",{baseUnit:"meter",unitName:"meter",factor:"1"},true)).toThrow();expect(()=>measuredQuantity("0.0001","ml",{baseUnit:"liter",unitName:"liter",factor:"1"},true)).toThrow();});
 it("rejects unsafe cost conversions instead of displaying an invented zero",()=>{for(const [q,c,f] of [["-1","1","1"],["1","NaN","1"],["1","1","0"],["1","1","Infinity"],["1e-3","1","1"]])expect(()=>lossValueCentavos(q,c,f)).toThrow();expect(()=>stockMeasurement("NaN","liter")).toThrow();});
});
