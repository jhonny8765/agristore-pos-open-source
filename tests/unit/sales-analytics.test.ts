import {describe,it,expect} from "vitest";
import {analyticsDates,analyticsMoney,analyticsChange,analyticsBar,analyticsCsv,popularProducts,readSalesAnalytics,validateAnalyticsFilters,type PopularProduct,type SalesAnalytics,type SalesFilters} from "../../apps/web/lib/sales-analytics";
const product=(id:string,purchases:number,grossSales:string,unit="kg"):PopularProduct=>({id,name:id,sku:`SKU-${id}`,base_unit:unit,quantity:"0.25",grossSales,purchases,previousPurchases:0});
describe("sales reporting",()=>{
 it("keeps centavos beyond Number's exact range",()=>expect(analyticsMoney("900719925474099301")).toBe("₱9,007,199,254,740,993.01"));
 it("shows negative net activity without pretending it is profit",()=>expect(analyticsMoney("-12345")).toBe("-₱123.45"));
 it.each([["0","0","No change"],["100","0","No earlier sales to compare"],["150","100","+50.0%"],["50","100","-50.0%"]])("compares %s with %s",(a,b,result)=>expect(analyticsChange(a,b)).toBe(result));
 it("ranks purchases without comparing different unit quantities",()=>{const rows=[product("expensive",1,"9007199254740999","piece"),product("popular",3,"100")];expect(popularProducts(rows,"purchases").map(p=>p.id)).toEqual(["popular","expensive"]);expect(rows[0].id).toBe("expensive");expect(popularProducts(rows,"value")[0].id).toBe("expensive");});
 it("keeps exact adjacent large monetary values ordered and searches SKU",()=>{const rows=[product("a",1,"9007199254740992"),product("b",1,"9007199254740993")];expect(popularProducts(rows,"value")[0].id).toBe("b");expect(popularProducts(rows,"purchases","sku-b").map(p=>p.id)).toEqual(["b"]);});
 it("handles zero chart scales and clamps bars",()=>{expect(analyticsBar("0","0")).toBe(0);expect(analyticsBar("25","100")).toBe(25);expect(analyticsBar("110","100")).toBe(100);});
 it.each([["2024-02-30","2024-03-01"],["2025-02-01","2024-01-01"],["2024-01-01","2025-01-01"],["","2024-01-01"]])("rejects invalid/custom span %s to %s",(fromDate,throughDate)=>expect(()=>validateAnalyticsFilters({period:"custom",interval:"day",fromDate,throughDate})).toThrow());
 it("allows a leap year with exactly 366 days",()=>expect(()=>validateAnalyticsFilters({period:"custom",interval:"month",fromDate:"2024-01-01",throughDate:"2024-12-31"})).not.toThrow());
 it("exports full snapshot quantities and escapes spreadsheet formulas",()=>{const data={fromDate:"2024-01-01",throughDate:"2024-01-31",asOf:"2024-02-01T00:00:00Z",products:[{...product("p",2,"900719925474099301"),name:"=HYPERLINK(1)",quantity:"12345678901234.123456"}]} as SalesAnalytics;const csv=analyticsCsv(data,"TEST branch","products");expect(csv).toContain("'=HYPERLINK(1)");expect(csv).toContain('"12345678901234.123456"');expect(csv).toContain('"9007199254740993.01"');expect(csv).toContain(data.asOf);});
});

const filters:SalesFilters={period:"custom",interval:"day",fromDate:"2024-02-29",throughDate:"2024-03-01"};
function snapshot():SalesAnalytics{return {version:1,branchId:"branch",period:"custom",interval:"day",fromDate:filters.fromDate,throughDate:filters.throughDate,previousFromDate:"2024-02-27",previousThroughDate:"2024-02-28",days:2,asOf:"2024-03-02T04:00:00Z",lastSync:null,
 totals:{grossSales:"300",salesCount:2,refunds:"200",recoveries:"100",netCash:"200",averageSale:"150"},previous:{grossSales:"400",salesCount:2,refunds:"0",recoveries:"0",netCash:"400",averageSale:"200"},
 trend:[{date:"2024-02-29",throughDate:"2024-02-29",grossSales:"100",salesCount:1,refunds:"0",recoveries:"0",netCash:"100"},{date:"2024-03-01",throughDate:"2024-03-01",grossSales:"200",salesCount:1,refunds:"200",recoveries:"100",netCash:"100"}],products:[{...product("kg",1,"100"),previousPurchases:2},{...product("liquid",1,"200","liter"),quantity:"0.125"}]};}
describe("verified report snapshots",()=>{
 it("accepts a complete leap-day snapshot without mixing exact units",()=>expect(readSalesAnalytics(snapshot(),"branch",filters)).toEqual(snapshot()));
 it.each([null,{}, {version:1,branchId:"branch"}])("rejects incomplete responses without a render-time crash (%j)",v=>expect(()=>readSalesAnalytics(v,"branch",filters)).toThrow("could not be verified"));
 it.each([
  ["wrong branch",(r:SalesAnalytics)=>{r.branchId="other";}],
  ["wrong preset",(r:SalesAnalytics)=>{r.period="month";}],
  ["wrong grouping",(r:SalesAnalytics)=>{r.interval="month";}],
  ["wrong requested dates",(r:SalesAnalytics)=>{r.fromDate="2024-02-28";r.days=3;}],
  ["missing trend day",(r:SalesAnalytics)=>{r.trend.pop();}],
  ["duplicated trend day",(r:SalesAnalytics)=>{r.trend[1]={...r.trend[0]};}],
  ["wrong summary gross",(r:SalesAnalytics)=>{r.totals.grossSales="301";r.totals.averageSale="151";r.totals.netCash="201";}],
  ["wrong summary refund",(r:SalesAnalytics)=>{r.totals.refunds="201";r.totals.netCash="199";}],
  ["wrong trend count",(r:SalesAnalytics)=>{r.trend[0].salesCount=2;}],
  ["wrong net",(r:SalesAnalytics)=>{r.totals.netCash="300";}],
  ["wrong average",(r:SalesAnalytics)=>{r.totals.averageSale="151";}],
  ["wrong comparison net",(r:SalesAnalytics)=>{r.previous.netCash="0";}],
  ["missing product",(r:SalesAnalytics)=>{r.products.pop();}],
  ["duplicated product",(r:SalesAnalytics)=>{r.products[1].id=r.products[0].id;}],
  ["wrong product value",(r:SalesAnalytics)=>{r.products[0].grossSales="101";}],
  ["impossible frequency",(r:SalesAnalytics)=>{r.products[0].purchases=3;}],
  ["impossible prior frequency",(r:SalesAnalytics)=>{r.products[0].previousPurchases=3;}],
  ["fractional pieces",(r:SalesAnalytics)=>{r.products[0].base_unit="piece";}],
  ["unknown base unit",(r:SalesAnalytics)=>{r.products[0].base_unit="sack";}],
  ["non-finite quantity",(r:SalesAnalytics)=>{r.products[0].quantity="Infinity";}],
  ["unsafe purchase count",(r:SalesAnalytics)=>{r.totals.salesCount=9007199254740992;}],
  ["invalid snapshot date",(r:SalesAnalytics)=>{r.asOf="not-a-date";}],
  ["future report",(r:SalesAnalytics)=>{r.asOf="2024-02-28T12:00:00Z";}],
  ["overlapping comparison",(r:SalesAnalytics)=>{r.previousThroughDate=r.fromDate;}],
 ] as const)("rejects %s",(_label,mutate)=>{const r=snapshot();mutate(r);expect(()=>readSalesAnalytics(r,"branch",filters)).toThrow("could not be verified");});
 it("accepts weekly partial buckets that cross a month boundary",()=>{const r=snapshot();r.interval="week";r.trend=[{...r.trend[0],throughDate:r.throughDate,...r.totals}];expect(readSalesAnalytics(r,"branch",{...filters,interval:"week"})).toEqual(r);});
 it("accepts month grouping split at the calendar boundary",()=>{const r=snapshot();r.interval="month";expect(readSalesAnalytics(r,"branch",{...filters,interval:"month"})).toEqual(r);});
 it("retains exact money beyond the safe Number range",()=>{const r=snapshot();r.totals.grossSales="900719925474099301";r.totals.netCash="900719925474099201";r.totals.averageSale="450359962737049651";r.trend[0].grossSales="900719925474099101";r.trend[0].netCash=r.trend[0].grossSales;r.products[0].grossSales=r.trend[0].grossSales;expect(readSalesAnalytics(r,"branch",filters)).toEqual(r);});
 it("accepts a refund-only period with negative activity and no popularity",()=>{const r=snapshot();r.totals={grossSales:"0",salesCount:0,refunds:"200",recoveries:"100",netCash:"-100",averageSale:"0"};r.products=[];r.trend=r.trend.map((row,n)=>({...row,grossSales:"0",salesCount:0,netCash:n?"-100":"0"}));expect(readSalesAnalytics(r,"branch",filters)).toEqual(r);});
});

describe("Manila calendar comparison boundaries",()=>{
 it.each([
  ["today","2024-02-29T15:59:59Z",["2024-02-29","2024-02-29","2024-02-28","2024-02-28"]],
  ["today","2024-02-29T16:00:00Z",["2024-03-01","2024-03-01","2024-02-29","2024-02-29"]],
  ["week","2024-03-03T15:59:59Z",["2024-02-26","2024-03-03","2024-02-19","2024-02-25"]],
  ["week","2024-03-03T16:00:00Z",["2024-03-04","2024-03-04","2024-02-26","2024-02-26"]],
  ["last_week","2024-03-03T16:00:00Z",["2024-02-26","2024-03-03","2024-02-19","2024-02-25"]],
  ["month","2024-03-30T16:00:00Z",["2024-03-01","2024-03-31","2024-02-01","2024-02-29"]],
  ["month","2025-03-30T16:00:00Z",["2025-03-01","2025-03-31","2025-02-01","2025-02-28"]],
  ["last_month","2025-01-14T16:00:00Z",["2024-12-01","2024-12-31","2024-11-01","2024-11-30"]],
  ["year","2024-02-29T04:00:00Z",["2023-03-01","2024-02-29","2022-03-01","2023-02-28"]],
  ["year","2025-01-01T04:00:00Z",["2024-02-01","2025-01-01","2023-02-01","2024-01-01"]],
 ] as const)("derives %s at %s",(period,asOf,expected)=>expect(Object.values(analyticsDates({...filters,period},asOf))).toEqual(expected));
});
