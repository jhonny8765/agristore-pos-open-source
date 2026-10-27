import Decimal from "decimal.js";
const Exact=Decimal.clone({precision:80});
export type MeasurementEntry="unit"|"base"|"ml";
export type Measurement={baseUnit:string;unitName:string;factor:string};
function number(raw:string){
 const s=raw.trim();let n:Decimal;
 if(/^\d{1,14}\s*\/\s*\d{1,14}$/.test(s)){const [a,b]=s.split("/");n=new Exact(a.trim()).div(b.trim());}
 else if(/^(?:\d{1,14}(?:\.\d{1,6})?|\.\d{1,6})$/.test(s))n=new Exact(s);
 else throw new Error("Enter a nonnegative quantity, such as 0.25 or 1/4, with at most six decimal places.");
 if(!n.isFinite()||n.lt(0)||n.decimalPlaces()>6||n.gte("100000000000000"))throw new Error("Use an exact nonnegative quantity with at most six decimal places.");return n;
}
export function measurementEntries(m:Measurement):{value:MeasurementEntry;label:string}[]{
 const options:{value:MeasurementEntry;label:string}[]=[{value:"unit",label:m.unitName}];
 if(["meter","liter"].includes(m.baseUnit)&&!new Exact(m.factor).eq(1))options.push({value:"base",label:m.baseUnit});
 if(m.baseUnit==="liter")options.push({value:"ml",label:"ml"});return options;
}
function baseFactor(m:Measurement,mode:MeasurementEntry){
 if(!measurementEntries(m).some(o=>o.value===mode))throw new Error("Choose a supported entry unit for this product.");
 return mode==="unit"?new Exact(m.factor):mode==="ml"?new Exact("0.001"):new Exact(1);
}
/** Stock commands always receive the original selected unit; conversions never round. */
export function measuredQuantity(raw:string,mode:MeasurementEntry,m:Measurement,positive=false){
 const factor=new Exact(m.factor);
 if(!factor.isFinite()||factor.lte(0))throw new Error("This product has an invalid conversion. Ask the owner to check its units.");
 const base=number(raw).times(baseFactor(m,mode)),quantity=base.div(factor);
 if(quantity.decimalPlaces()>6||base.decimalPlaces()>6||!quantity.times(factor).eq(base))throw new Error("This amount cannot be represented exactly in the selected selling unit. Choose a meter or one-liter unit; do not round it.");
 if(base.gte("100000000000000")||quantity.gte("100000000000000"))throw new Error("Converted quantity is too large.");
 if(positive&&quantity.lte(0))throw new Error("Quantity must be greater than zero.");
 if(m.baseUnit==="piece"&&!base.isInteger())throw new Error("Piece stock must be a whole number.");
 return {quantity:quantity.toFixed(),baseQuantity:base.toFixed()};
}
export function measurementDisplay(quantity:string,mode:MeasurementEntry,m:Measurement){
 const value=number(quantity).times(m.factor).div(baseFactor(m,mode));
 const raw=number(value.toFixed()).toFixed();
 if(measuredQuantity(raw,mode,m).quantity!==number(quantity).toFixed())throw new Error("This unit switch would change the recorded quantity. Keep the original entry unit.");return raw;
}
