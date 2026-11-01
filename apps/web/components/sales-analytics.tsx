"use client";
import {useCallback,useEffect,useId,useMemo,useRef,useState} from "react";
import Decimal from "decimal.js";
import {command} from "../lib/api";
import {analyticsBar,analyticsChange,analyticsCsv,analyticsMoney,popularProducts,validateAnalyticsFilters,type SalesAnalytics as Report,type SalesFilters,type SalesInterval,type SalesPeriod} from "../lib/sales-analytics";
import {Button} from "./ui/button";
import styles from "./sales-analytics.module.css";

const periods:{value:SalesPeriod;label:string}[]=[{value:"today",label:"Today"},{value:"week",label:"This week"},{value:"last_week",label:"Last week"},{value:"month",label:"This month"},{value:"last_month",label:"Last month"},{value:"year",label:"Last 12 months"},{value:"custom",label:"Choose dates"}];
const dateLabel=(date:string)=>new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",year:"numeric"});
const stamp=(date:string)=>new Date(date).toLocaleString("en-PH",{timeZone:"Asia/Manila"});
function download(name:string,contents:string){const url=URL.createObjectURL(new Blob([contents],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function SalesAnalytics({organizationId,branchId,branchName,online,disabled,revision}:{organizationId:string;branchId:string;branchName:string;online:boolean;disabled:boolean;revision:number}){
 const initial:SalesFilters={period:"month",interval:"day",fromDate:"",throughDate:""};
 const [draft,setDraft]=useState(initial),[filters,setFilters]=useState(initial),[data,setData]=useState<Report>(),[error,setError]=useState(""),[loading,setLoading]=useState(false),[sort,setSort]=useState<"purchases"|"value">("purchases"),[search,setSearch]=useState(""),[limit,setLimit]=useState(20);
 const generation=useRef(0),id=useId();
 const invalidate=useCallback(()=>{generation.current++;},[]);
 const load=useCallback(async()=>{const request=++generation.current;setLoading(true);setError("");try{const result=await command<Report>("sales_analytics",{organizationId,branchId,...filters});if(request!==generation.current)return;if(result.version!==1||result.branchId!==branchId)throw new Error("The report did not match this branch. Refresh online.");setData(result);setLimit(20);}catch(e){if(request===generation.current)setError(e instanceof Error?e.message:"Could not load sales analytics. Retry online.");}finally{if(request===generation.current)setLoading(false);}},[organizationId,branchId,filters]);
 useEffect(()=>{if(online)void load();else setLoading(false);return invalidate;},[load,online,revision,invalidate]);
 const products=useMemo(()=>popularProducts(data?.products??[],sort,search),[data,sort,search]);
 const max=data?.trend.reduce((a,p)=>new Decimal(a).gte(p.grossSales)?a:p.grossSales,"0")??"0";
 const blocked=disabled||!online||loading;
 const file=(kind:"products"|"trend")=>{if(data)download(`sales-${kind}-${data.fromDate}-${data.throughDate}.csv`,analyticsCsv(data,branchName,kind));};
 return <section className={`panel ${styles.analytics}`} aria-labelledby={`${id}-title`}>
  <div className="section-heading"><div><h2 id={`${id}-title`}>Sales analytics</h2><p className="muted">See how {branchName} is selling, compare periods and find the products customers buy most often.</p></div><Button variant="outline" disabled={blocked} onClick={()=>void load()}>Refresh sales analytics</Button></div>
  <form className={styles.filters} aria-label="Sales analytics filters" onSubmit={e=>{e.preventDefault();try{validateAnalyticsFilters(draft);setFilters({...draft});setError("");}catch(e){setError(e instanceof Error?e.message:"Check the report dates.");}}}>
   <label className="field"><span>Sales period</span><select value={draft.period} onChange={e=>setDraft({...draft,period:e.target.value as SalesPeriod,interval:e.target.value==="year"?"month":draft.interval})}>{periods.map(p=><option value={p.value} key={p.value}>{p.label}</option>)}</select></label>
   <label className="field"><span>Group sales by</span><select value={draft.interval} onChange={e=>setDraft({...draft,interval:e.target.value as SalesInterval})}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label>
   {draft.period==="custom"&&<><label className="field"><span>Sales from date</span><input type="date" required value={draft.fromDate} onChange={e=>setDraft({...draft,fromDate:e.target.value})}/></label><label className="field"><span>Sales through date</span><input type="date" required value={draft.throughDate} onChange={e=>setDraft({...draft,throughDate:e.target.value})}/></label></>}
   <Button disabled={blocked}>Apply sales period</Button>
  </form>
  {loading&&<p role="status">Loading sales analytics…{data?" The previous report remains below until the new one loads.":""}</p>}
  {error&&<p role="alert" className="notice error">{error}{data?" The report and exports below still use the displayed dates and snapshot.":" Reconnect and refresh to retry."}</p>}
  {!online&&<p className="notice">Reconnect for current sales. Any loaded report keeps its original dates and snapshot; pending offline sales are excluded.</p>}
  {data&&<>
   <p className={styles.scope}><strong>{branchName} · {dateLabel(data.fromDate)} – {dateLabel(data.throughDate)}</strong><br/>Snapshot: {stamp(data.asOf)} · Asia/Manila<br/>Compare with {dateLabel(data.previousFromDate)} – {dateLabel(data.previousThroughDate)}.<br/>Last PC synchronization: {data.lastSync?stamp(data.lastSync):"Not yet recorded"}. Only server-confirmed sales are included; synchronize every cashier PC for a complete report.</p>
   <dl className={styles.metrics}>
    <div><dt>Gross sales</dt><dd>{analyticsMoney(data.totals.grossSales)}</dd><small>{analyticsChange(data.totals.grossSales,data.previous.grossSales)} versus comparison period</small></div>
    <div><dt>Completed purchases</dt><dd>{data.totals.salesCount.toLocaleString("en-PH")}</dd><small>{data.previous.salesCount.toLocaleString("en-PH")} in comparison period</small></div>
    <div><dt>Average purchase</dt><dd>{analyticsMoney(data.totals.averageSale)}</dd><small>Original gross sales ÷ purchases</small></div>
    <div><dt>Sales less refund cash</dt><dd>{analyticsMoney(data.totals.netCash)}</dd><small>Refunds paid {analyticsMoney(data.totals.refunds)} · Cash recovered {analyticsMoney(data.totals.recoveries)}</small></div>
   </dl>
   <p className="muted">Sales follow the original sale date. Refund cash and recovered refund cash follow their posting date, including refunds for earlier purchases. This is sales activity, not profit or the cash counted in a drawer. Weeks start Monday; the current week/month is to date. Comparison dates are shown above.</p>
   <div className={styles.sectionHead}><h3>Sales trend</h3><Button size="sm" variant="outline" disabled={loading} onClick={()=>file("trend")}>Export sales trend (CSV)</Button></div>
   {!data.totals.salesCount&&<p className="notice">No confirmed purchases in this period. Try a different period, or synchronize pending sales. Refund activity may still appear below.</p>}
   <div className={styles.chart} role="region" aria-label="Gross sales trend" tabIndex={0}><ol>{data.trend.map(p=><li key={p.date}><span>{dateLabel(p.date)}{p.date!==p.throughDate&&<small> through {dateLabel(p.throughDate)}</small>}</span><span className={styles.track} aria-hidden="true"><span style={{width:`${analyticsBar(p.grossSales,max)}%`}}/></span><strong>{analyticsMoney(p.grossSales)}</strong></li>)}</ol></div>
   <details className={styles.detail}><summary>Show exact sales and refund totals by period</summary><div className="table-wrap" role="region" aria-label="Sales trend details" tabIndex={0}><table><thead><tr>{["Period","Purchases","Gross sales","Refund cash paid","Cash recovered","Sales less refund cash"].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{data.trend.map(p=><tr key={p.date}><td>{dateLabel(p.date)} – {dateLabel(p.throughDate)}</td><td>{p.salesCount}</td><td>{analyticsMoney(p.grossSales)}</td><td>{analyticsMoney(p.refunds)}</td><td>{analyticsMoney(p.recoveries)}</td><td>{analyticsMoney(p.netCash)}</td></tr>)}</tbody></table></div></details>
   <div className={styles.sectionHead}><h3>Popular products</h3><Button size="sm" variant="outline" disabled={loading||!data.products.length} onClick={()=>file("products")}>Export all product totals (CSV)</Button></div>
   <p>Popularity counts separate purchases containing each product, even when the same product appears in multiple units or lots on one receipt. Quantities use each product’s own base unit. Original sales and quantities are before refunds; refund cash is reported separately above.</p>
   <div className={styles.filters}><label className="field"><span>Rank products by</span><select value={sort} onChange={e=>{setSort(e.target.value as typeof sort);setLimit(20);}}><option value="purchases">Most purchases</option><option value="value">Highest gross sales</option></select></label><label className="field"><span>Find a popular product</span><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setLimit(20);}} placeholder="Product name or SKU"/></label></div>
   <div className="table-wrap" role="region" aria-label="Popular product totals" tabIndex={0}><table><thead><tr>{["Product","Purchases","Quantity sold","Gross sales","Purchases in comparison period"].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{products.slice(0,limit).map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>{p.sku}</small></td><td>{p.purchases}</td><td>{p.quantity} {p.base_unit}</td><td>{analyticsMoney(p.grossSales)}</td><td>{p.previousPurchases}</td></tr>)}</tbody></table></div>
   <div className={styles.sectionHead}><p className="muted">Showing {Math.min(limit,products.length)} of {products.length} matching products · {data.products.length} products sold in this snapshot. The CSV includes every product in the report, regardless of this search.</p>{products.length>limit&&<Button variant="outline" onClick={()=>setLimit(limit+20)}>Show 20 more products</Button>}</div>
   {!products.length&&<p>{search?"No product matches this search.":"Product rankings will appear after confirmed purchases."}</p>}
  </>}
 </section>;
}
