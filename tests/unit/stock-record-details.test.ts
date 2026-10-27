import {describe,expect,it} from "vitest";
import {stockControlIdentity} from "../../apps/web/lib/stock-controls";
import {product,uuid} from "./fixtures";
describe("authorized stock-record measurement details",()=>{
 it("identifies a held liquid and lot without the local catalog",()=>{
  expect(stockControlIdentity([],{product_id:uuid(90),batch_id:uuid(91),product_name:"TEST measured liquid",base_unit:"liter",lot:"TEST-LIQ-A",expires_on:"2027-12-31"})).toEqual({name:"TEST measured liquid",baseUnit:"liter",lot:"Lot TEST-LIQ-A",expiresOn:"2027-12-31"});
 });
 it("uses fresh server identity rather than an older cached name",()=>{
  expect(stockControlIdentity([product],{product_id:product.id,batch_id:null,product_name:"TEST renamed product",base_unit:"kg",lot:null})).toEqual({name:"TEST renamed product",baseUnit:"kg",lot:"No lot recorded",expiresOn:null});
 });
 it("does not invent a measurement or borrow another product's lot",()=>{
  expect(stockControlIdentity([{...product,batches:[{id:uuid(91),lot:"OTHER",expiresOn:null}]}],{product_id:uuid(90),batch_id:uuid(91),base_unit:"unknown",product_name:"",lot:null})).toEqual({name:`Product ${uuid(90)}`,baseUnit:"",lot:`Batch ${uuid(91)} (details unavailable)`,expiresOn:null});
 });
 it("ignores lot and expiry details when there is no batch",()=>{
  expect(stockControlIdentity([],{product_id:uuid(90),batch_id:null,base_unit:"meter",lot:"UNRELATED",expires_on:"2027-12-31"})).toEqual({name:`Product ${uuid(90)}`,baseUnit:"meter",lot:"No lot recorded",expiresOn:null});
 });
 it("continues to resolve older responses from the matching cached product",()=>{
  expect(stockControlIdentity([product],{product_id:product.id,batch_id:null}).baseUnit).toBe(product.baseUnit);
 });
});
