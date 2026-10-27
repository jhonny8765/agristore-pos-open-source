import "fake-indexeddb/auto";
import {afterEach,expect,it,vi} from "vitest";
import {localStock,saveCheckout,syncOnce,type PosDatabase,type Transport} from "@agristore/offline";
import {product,sale,setupDB,uuid} from "./fixtures";
const opened:PosDatabase[]=[];afterEach(async()=>{for(const db of opened.splice(0)){db.close();await db.delete();}});
async function prepared(){const db=await setupDB();opened.push(db);for(const n of [800,801])await saveCheckout(db,sale({transactionId:uuid(n)}));return db;}
it.each([{code:"PGRST301"},{code:"PGRST302"},{code:"PGRST303"},{code:"42501"},{status:401},{status:403},{authenticationRequired:true}])("pauses a batch after access failure %j without consuming retries",async signal=>{
 const db=await prepared(),rows=await db.sales.toArray();await db.sales.update(rows[0].id,{attempts:9});const before=await db.sales.toArray();
 const t:Transport={authorize:async()=>true,push:vi.fn(async()=>{throw Object.assign(new Error("TEST access ended during upload"),signal);}),snapshot:vi.fn()};
 await syncOnce(db,t);expect(t.push).toHaveBeenCalledTimes(1);expect(t.snapshot).not.toHaveBeenCalled();
 const after=await db.sales.toArray();for(let n=0;n<after.length;n++){expect(after[n]).toMatchObject({id:before[n].id,payload:before[n].payload,fingerprint:before[n].fingerprint,attempts:before[n].attempts,nextAttempt:before[n].nextAttempt,status:"authentication_required"});}expect((await localStock(db)).get(product.id+":none")).toBe("498");
});
it("retains an earlier committed sale through mid-batch expiry and acknowledges the same IDs after sign-in",async()=>{
 const db=await prepared(),before=await db.sales.toArray(),saved=new Map<string,unknown>();let calls=0,expired=true;
 const t:Transport={authorize:async()=>true,push:vi.fn<Transport["push"]>(async s=>{calls++;if(expired&&calls===2)throw Object.assign(new Error("TEST JWT expired"),{code:"PGRST303",status:401});const duplicate=saved.has(s.transactionId);saved.set(s.transactionId,s);return {transactionId:s.transactionId,status:duplicate?"duplicate":"created"};}),snapshot:vi.fn<Transport["snapshot"]>(async ids=>({products:[product],stocks:[{key:product.id+":none",productId:product.id,batchId:null,quantity:String(500-saved.size)}],confirmedIds:ids.filter(id=>saved.has(id)),asOf:new Date().toISOString()}))};
 await syncOnce(db,t);expect(saved.size).toBe(1);expect(t.snapshot).not.toHaveBeenCalled();expect((await db.sales.toArray()).map(r=>r.status)).toEqual(["authentication_required","authentication_required"]);expect((await localStock(db)).get(product.id+":none")).toBe("498");
 expired=false;await syncOnce(db,t);expect(saved.size).toBe(2);expect((await db.sales.toArray()).map(r=>r.status)).toEqual(["synced","synced"]);expect((await localStock(db)).get(product.id+":none")).toBe("498");expect([...saved.keys()].sort()).toEqual(before.map(r=>r.id).sort());for(const original of before)expect((await db.sales.get(original.id))?.payload).toEqual(original.payload);
});
it("does not overwrite a genuine owner-review outcome when later access fails",async()=>{
 const db=await prepared();let calls=0;const t:Transport={authorize:async()=>true,push:async s=>{if(++calls===1)return {transactionId:s.transactionId,status:"review",reason:"TEST changed immutable contents"};throw Object.assign(new Error("TEST revoked access"),{code:"42501"});},snapshot:vi.fn()};
 await syncOnce(db,t);const rows=await db.sales.toArray();expect(rows[0].status).toBe("review_required");expect(rows[0].error).toBe("TEST changed immutable contents");expect(rows[1].status).toBe("authentication_required");expect(t.snapshot).not.toHaveBeenCalled();
});
it("keeps genuine network failures on backoff rather than mislabeling them as sign-in errors",async()=>{
 const db=await prepared();const t:Transport={authorize:async()=>true,push:async()=>{throw new Error("TEST network interrupted");},snapshot:async()=>({products:[product],stocks:[{key:product.id+":none",productId:product.id,batchId:null,quantity:"500"}],confirmedIds:[],asOf:new Date().toISOString()})};
 await syncOnce(db,t);for(const row of await db.sales.toArray()){expect(row.status).toBe("retryable");expect(row.attempts).toBe(1);expect(row.nextAttempt).toBeGreaterThan(0);}
});
