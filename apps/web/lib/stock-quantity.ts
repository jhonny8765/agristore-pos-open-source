import Decimal from "decimal.js";
const Exact=Decimal.clone({precision:80});
/** Display equivalents only; stock commands and CSV retain canonical base quantities. */
export function stockMeasurement(raw:unknown,baseUnit:string){const q=new Exact(String(raw));if(!q.isFinite())throw new Error("Stock quantity is invalid.");return `${q.toFixed()} ${baseUnit}${baseUnit==="liter"?` (${q.times(1000).toFixed()} ml)`:""}`;}
