import {describe,it,expect} from "vitest";
import {analyticsMoney,analyticsChange,analyticsBar,analyticsCsv,popularProducts,validateAnalyticsFilters,type PopularProduct,type SalesAnalytics} from "../../apps/web/lib/sales-analytics";
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
