import "fake-indexeddb/auto";
import {afterEach,expect,it,vi} from "vitest";
import {makeItem,type Snapshot} from "@agristore/domain";
import {clearAccountCache,saveCheckout,setSetting,syncOnce,type PosDatabase,type Transport} from "@agristore/offline";
import {lease,product,sale,setupDB,uuid} from "./fixtures";

const databases:PosDatabase[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const d of databases.splice(0)){d.close();await d.delete();}});
const beforeMidnight=Date.parse("2026-10-25T15:59:00Z");
const afterMidnight=Date.parse("2026-10-25T16:00:01Z");
const tracked={...product,tracksExpiry:true,batches:[{id:uuid(51),lot:"TEST expires tonight",expiresOn:"2026-10-25"}]};
async function local(){const d=await setupDB();databases.push(d);await d.products.put(tracked);await setSetting(d,"lease",lease(beforeMidnight));return d;}
function payload(){const item=makeItem(tracked,uuid(12),"0.25",uuid(51),"2026-10-25");return sale({items:[item],total:item.lineTotal,cashReceived:1000,occurredAt:new Date(beforeMidnight).toISOString()});}

it("rechecks a cart's expiry at the durable save boundary across Manila midnight",async()=>{
 const d=await local();
 await expect(saveCheckout(d,payload(),afterMidnight)).rejects.toThrow(/expired/i);
 expect(await d.sales.count()).toBe(0);
});
it("requires the current catalog's lot even if a cart predates tracked-lot configuration",async()=>{
 const d=await local(),s=payload();s.items[0].batchId=null;
 await expect(saveCheckout(d,s,beforeMidnight)).rejects.toThrow(/batch|lot/i);
 expect(await d.sales.count()).toBe(0);
});
it("rejects a removed or foreign lot at save time",async()=>{
 const d=await local(),s=payload();s.items[0].batchId=uuid(999);
 await expect(saveCheckout(d,s,beforeMidnight)).rejects.toThrow(/batch|lot/i);
 expect(await d.sales.count()).toBe(0);
});
it("still returns the original committed sale when its acknowledgment is retried after expiry",async()=>{
 const d=await local(),s=payload();
 const saved=await saveCheckout(d,s,beforeMidnight);
 expect(await saveCheckout(d,s,afterMidnight)).toEqual(saved);
 expect(await d.sales.count()).toBe(1);
});
it("stops an old sync runner after another window clears the cashier context",async()=>{
 const d=await setupDB();databases.push(d);await saveCheckout(d,sale());await saveCheckout(d,sale());
 const push=vi.fn(async(s:ReturnType<typeof sale>)=>{await clearAccountCache(d);return{transactionId:s.transactionId,status:"created" as const};});
 const snapshot=vi.fn(async():Promise<Snapshot>=>({products:[product],stocks:[],confirmedIds:[],asOf:new Date().toISOString()}));
 const transport:Transport={authorize:async()=>true,push,snapshot};
 await expect(syncOnce(d,transport)).rejects.toThrow(/changed|sign|context/i);
 expect(push).toHaveBeenCalledTimes(1);
 expect(snapshot).not.toHaveBeenCalled();
 expect(await d.products.count()).toBe(0);
 expect(await d.sales.count()).toBe(2);
});
it("does not restore a snapshot that arrives after sign-out in another window",async()=>{
 const d=await setupDB();databases.push(d);const s=sale();await saveCheckout(d,s);
 const transport:Transport={authorize:async()=>true,push:async(p)=>({transactionId:p.transactionId,status:"created"}),snapshot:async()=>{
  await clearAccountCache(d);return{products:[product],stocks:[],confirmedIds:[s.transactionId],asOf:new Date().toISOString()};
 }};
 await expect(syncOnce(d,transport)).rejects.toThrow(/context changed/i);
 expect(await d.products.count()).toBe(0);expect((await d.sales.get(s.transactionId))?.status).toBe("sending");
 expect(await d.settings.get("lastSync")).toBeUndefined();
});
it("does not overwrite its successor's synchronized sale or release its lock after a late upload error",async()=>{
 const d=await setupDB();databases.push(d);const s=sale();await saveCheckout(d,s);
 const snapshot=vi.fn(async():Promise<Snapshot>=>({products:[product],stocks:[],confirmedIds:[],asOf:new Date().toISOString()}));
 const transport:Transport={authorize:async()=>true,snapshot,push:async()=>{
  await d.locks.put({key:"sync",owner:"TEST successor",expiresAt:Date.now()+45000});
  await d.sales.update(s.transactionId,{status:"synced"});
  throw new Error("TEST stale runner network failure");
 }};
 await expect(syncOnce(d,transport)).rejects.toThrow(/context changed/i);
 expect((await d.sales.get(s.transactionId))?.status).toBe("synced");
 expect((await d.locks.get("sync"))?.owner).toBe("TEST successor");
 expect(snapshot).not.toHaveBeenCalled();
});
