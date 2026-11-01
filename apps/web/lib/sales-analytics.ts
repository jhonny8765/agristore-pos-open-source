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
