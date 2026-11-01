import Decimal from "decimal.js";
import {historyBounds,historyCsv} from "./history";
const Exact=Decimal.clone({precision:80,rounding:Decimal.ROUND_HALF_UP});

export type SalesPeriod="today"|"week"|"last_week"|"month"|"last_month"|"year"|"custom";
export type SalesInterval="day"|"week"|"month";
export type SalesFilters={period:SalesPeriod;interval:SalesInterval;fromDate:string;throughDate:string};
export type SalesTotals={grossSales:string;salesCount:number;refunds:string;recoveries:string;netCash:string;averageSale:string};
export type SalesTrend={date:string;throughDate:string;grossSales:string;salesCount:number;refunds:string;recoveries:string;netCash:string};
export type PopularProduct={id:string;name:string;sku:string;base_unit:string;quantity:string;grossSales:string;purchases:number;previousPurchases:number};
export type SalesAnalytics={version:1;branchId:string;period:SalesPeriod;interval:SalesInterval;fromDate:string;throughDate:string;previousFromDate:string;previousThroughDate:string;days:number;asOf:string;lastSync:string|null;totals:SalesTotals;previous:SalesTotals;trend:SalesTrend[];products:PopularProduct[]};
// Derive calendar windows from the server snapshot time, never the cashier PC's
// clock. Clamp month/year shifts at month-end instead of rolling into March.
export function analyticsDates(filters:SalesFilters,asOf:string){
 const date=(s:string)=>new Date(`${s}T00:00:00Z`),iso=(d:Date)=>d.toISOString().slice(0,10),add=(d:Date,n:number)=>new Date(d.getTime()+n*86400000);
 const month=(d:Date,n:number)=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1));
 const shift=(d:Date,n:number)=>new Date(Math.min(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,d.getUTCDate()),month(d,n+1).getTime()-86400000));
 const today=date(new Date(Date.parse(asOf)+8*3600000).toISOString().slice(0,10));let from=today,through=today,priorFrom:Date,priorThrough:Date;
 if(filters.period==="custom"){from=date(filters.fromDate);through=date(filters.throughDate);priorThrough=add(from,-1);priorFrom=add(from,-((through.getTime()-from.getTime())/86400000+1));}
 else if(filters.period==="week"||filters.period==="last_week"){from=add(today,1-(today.getUTCDay()||7));if(filters.period==="last_week"){through=add(from,-1);from=add(from,-7);}priorFrom=add(from,-7);priorThrough=add(through,-7);}
 else if(filters.period==="month"||filters.period==="last_month"){from=month(today,0);if(filters.period==="last_month"){through=add(from,-1);from=month(from,-1);}priorFrom=month(from,-1);priorThrough=filters.period==="last_month"?add(from,-1):new Date(Math.min(add(from,-1).getTime(),add(priorFrom,through.getUTCDate()-1).getTime()));}
 else if(filters.period==="year"){from=month(today,-11);priorFrom=month(from,-12);priorThrough=shift(through,-12);}
 else {priorFrom=add(today,-1);priorThrough=priorFrom;}
 return {fromDate:iso(from),throughDate:iso(through),previousFromDate:iso(priorFrom),previousThroughDate:iso(priorThrough)};
}
// Treat the RPC response as untrusted. A partial/stale API response must never
// replace a coherent snapshot or crash the owner screen after setState.
export function readSalesAnalytics(value:unknown,branchId:string,filters:SalesFilters):SalesAnalytics {
 const invalid=()=>{throw new Error("Sales analytics could not be verified. Refresh online; the last verified report is kept.");};
 const integer=(v:unknown,signed=false)=>{if(typeof v!=="string"||!(signed?/^-?\d+$/:/^\d+$/).test(v))invalid();return new Exact(v as string);};
 const count=(v:unknown)=>{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0)invalid();return v as number;};
 const day=(v:unknown)=>{if(typeof v!=="string")invalid();return Date.parse(historyBounds({from:v as string,to:""}).from!);};
 const totals=(t:SalesTotals)=>{const gross=integer(t.grossSales),refund=integer(t.refunds),recovery=integer(t.recoveries),n=count(t.salesCount);if(!integer(t.netCash,true).eq(gross.minus(refund).plus(recovery))||!integer(t.averageSale).eq(n?gross.div(n).toDecimalPlaces(0):0)||(!n&&!gross.isZero()))invalid();};
 try {
  if(!value||typeof value!=="object")invalid();
  const data=value as SalesAnalytics;
  if(data.version!==1||data.branchId!==branchId||data.period!==filters.period||data.interval!==filters.interval)invalid();
  const from=day(data.fromDate),through=day(data.throughDate),priorFrom=day(data.previousFromDate),priorThrough=day(data.previousThroughDate);
  if(through<from||through-from>365*86400000||priorThrough<priorFrom||priorThrough>=from||data.days!==(through-from)/86400000+1)invalid();
  if(filters.period==="custom"&&(data.fromDate!==filters.fromDate||data.throughDate!==filters.throughDate))invalid();
  if(typeof data.asOf!=="string"||!Number.isFinite(Date.parse(data.asOf))||through>Date.parse(data.asOf)||!(data.lastSync===null||typeof data.lastSync==="string"&&Number.isFinite(Date.parse(data.lastSync))))invalid();
  const dates=analyticsDates(filters,data.asOf);for(const key of Object.keys(dates) as (keyof typeof dates)[])if(data[key]!==dates[key])invalid();
  totals(data.totals);totals(data.previous);
  if(!Array.isArray(data.trend)||!Array.isArray(data.products))invalid();
  let next=from;const sums={grossSales:new Exact(0),refunds:new Exact(0),recoveries:new Exact(0),netCash:new Exact(0),salesCount:new Exact(0)};
  for(const row of data.trend){
   const start=day(row.date),end=day(row.throughDate);
   // Reconstruct the bucket boundary independently of the response. Date-only
   // UTC arithmetic avoids the computer's timezone and daylight-saving rules.
   const boundary=new Date(`${row.date}T00:00:00Z`);
   if(data.interval==="month")boundary.setUTCMonth(boundary.getUTCMonth()+1,1);
   else boundary.setUTCDate(boundary.getUTCDate()+(data.interval==="week"?(8-(boundary.getUTCDay()||7)):1));
   if(start!==next||end!==Math.min(through,boundary.getTime()-8*3600000-86400000))invalid();
   const gross=integer(row.grossSales),refund=integer(row.refunds),recovery=integer(row.recoveries),net=integer(row.netCash,true),n=count(row.salesCount);
   if(!net.eq(gross.minus(refund).plus(recovery))||(!n&&!gross.isZero()))invalid();
   sums.grossSales=sums.grossSales.plus(gross);sums.refunds=sums.refunds.plus(refund);sums.recoveries=sums.recoveries.plus(recovery);sums.netCash=sums.netCash.plus(net);sums.salesCount=sums.salesCount.plus(n);next=end+86400000;
  }
  if(next!==through+86400000)invalid();
  for(const key of Object.keys(sums) as (keyof typeof sums)[])if(!sums[key].eq(data.totals[key]))invalid();
  const ids=new Set<string>();let productGross=new Exact(0);
  for(const p of data.products){
   if(typeof p.id!=="string"||!p.id||ids.has(p.id)||typeof p.name!=="string"||typeof p.sku!=="string"||!["kg","liter","meter","piece"].includes(p.base_unit)||typeof p.quantity!=="string"||!/^\d+(?:\.\d+)?$/.test(p.quantity))invalid();
   const q=new Exact(p.quantity);if(!q.isPositive()||p.base_unit==="piece"&&!q.isInteger()||!count(p.purchases)||p.purchases>data.totals.salesCount||count(p.previousPurchases)>data.previous.salesCount)invalid();
   ids.add(p.id);productGross=productGross.plus(integer(p.grossSales));
  }
  if(!productGross.eq(data.totals.grossSales)||Boolean(data.totals.salesCount)!==Boolean(data.products.length))invalid();
  return data;
 }catch{ return invalid(); }
}
export function analyticsMoney(value:string){const n=new Exact(value);return `${n.isNegative()?"-":""}₱${n.abs().div(100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",")}`;}
export function analyticsChange(value:string,previous:string){const a=new Exact(value),b=new Exact(previous);if(b.isZero())return a.isZero()?"No change":"No earlier sales to compare";const change=a.minus(b).div(b.abs()).mul(100);return `${change.isPositive()?"+":""}${change.toFixed(1)}%`;}
export function validateAnalyticsFilters(filters:SalesFilters){if(filters.period!=="custom")return;const {from,to}=historyBounds({from:filters.fromDate,to:filters.throughDate});if(!from||!to)throw new Error("Enter both report dates.");if(Date.parse(to)-Date.parse(from)>366*86400000)throw new Error("Choose an ordered range of at most 366 days.");}
export function popularProducts(rows:PopularProduct[],sort:"purchases"|"value",search=""){const q=search.trim().toLocaleLowerCase();return rows.filter(p=>!q||`${p.name} ${p.sku}`.toLocaleLowerCase().includes(q)).sort((a,b)=>(sort==="value"?new Exact(b.grossSales).comparedTo(a.grossSales):b.purchases-a.purchases)||new Exact(b.grossSales).comparedTo(a.grossSales)||a.id.localeCompare(b.id));}
export function analyticsBar(value:string,max:string){return new Exact(max).isZero()?0:Exact.min(100,Exact.max(0,new Exact(value).div(max).mul(100))).toNumber();}
export function analyticsCsv(data:SalesAnalytics,branch:string,kind:"trend"|"products"){
 const common=[{label:"Branch",value:()=>branch},{label:"From date",value:()=>data.fromDate},{label:"Through date",value:()=>data.throughDate},{label:"Snapshot",value:()=>data.asOf}];
 if(kind==="products")return historyCsv([...common,{label:"Product ID",value:r=>r.id},{label:"Product",value:r=>r.name},{label:"SKU",value:r=>r.sku},{label:"Base unit",value:r=>r.base_unit},{label:"Quantity sold",numeric:true,value:r=>r.quantity},{label:"Purchases containing product",numeric:true,value:r=>r.purchases},{label:"Gross sales PHP",numeric:true,value:r=>new Exact(String(r.grossSales)).div(100).toFixed(2)}],data.products);
 return historyCsv([...common,{label:"Bucket from",value:r=>r.date},{label:"Bucket through",value:r=>r.throughDate},{label:"Sales",numeric:true,value:r=>r.salesCount},...([['grossSales','Gross sales PHP'],['refunds','Refund cash paid PHP'],['recoveries','Refund cash recovered PHP'],['netCash','Net sales less refund cash PHP']] as const).map(([key,label])=>({label,numeric:true,value:(r:Record<string,unknown>)=>new Exact(String(r[key])).div(100).toFixed(2)}))],data.trend);
}
