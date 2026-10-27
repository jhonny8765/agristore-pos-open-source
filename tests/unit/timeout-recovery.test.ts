import "fake-indexeddb/auto";
import {afterEach,expect,it,vi} from "vitest";
import {exportRecovery,type PosDatabase} from "@agristore/offline";
import {cloudTransport,supabase} from "../../apps/web/lib/api";
import {isDatabaseRejection} from "../../apps/web/lib/command-error";
import {onlineOperation,pendingOperations,retryOperation} from "../../apps/web/lib/operations";
import {lease,sale,setupDB,uuid} from "./fixtures";
const opened:PosDatabase[]=[];afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const db of opened.splice(0)){db.close();await db.delete();}});
it.each([new DOMException("TEST response interrupted","TimeoutError"),new DOMException("TEST response aborted","AbortError"),{code:23},{code:"23"},{code:"22"},null])("does not treat an ambiguous native/network error as a confirmed rollback: %j",error=>expect(isDatabaseRejection(error)).toBe(false));
it.each(["P0001","22P02","22003","23505","23503"])("retains the existing confirmed SQLSTATE %s rollback rule",code=>expect(isDatabaseRejection({code})).toBe(true));
it("does not turn a native browser timeout into a permanent sale-review acknowledgment",async()=>{
 vi.stubGlobal("navigator",{onLine:true});const timeout=new DOMException("TEST upload response timed out","TimeoutError");expect(timeout.code).toBe(23);vi.spyOn(supabase,"rpc").mockImplementationOnce(()=>{throw timeout;});await expect(cloudTransport(lease()).push(sale())).rejects.toBe(timeout);
});
it("retains and exports the original uncertain stock request after native timeout, then retries that ID",async()=>{
 vi.stubGlobal("navigator",{onLine:true});const db=await setupDB();opened.push(db);const timeout=new DOMException("TEST committed receiving response timed out","TimeoutError");const rpc=vi.spyOn(supabase,"rpc").mockImplementation(()=>{throw timeout;});
 const data={organizationId:uuid(1),branchId:uuid(2),source:"purchase",reference:"TEST timeout delivery",items:[{productId:uuid(10),unitId:uuid(12),quantity:"0.25"}]};
 await expect(onlineOperation(db,uuid(4),"receive_stock",data,"receiptId")).rejects.toBe(timeout);const original=(await pendingOperations(db))[0];expect(original.data.receiptId).toMatch(/^[0-9a-f-]{36}$/);expect(original.error).toContain("timed out");
 const recovery=JSON.parse(JSON.stringify(await exportRecovery(db)));expect(recovery.pendingOperations[0].data.receiptId).toBe(original.data.receiptId);
 // The result was lost again: retain the same generated receipt reference.
 await expect(retryOperation(db,uuid(4),original)).rejects.toBe(timeout);expect((await pendingOperations(db))[0].data).toEqual(original.data);expect(rpc).toHaveBeenCalledTimes(2);
 rpc.mockImplementation(()=>Promise.resolve({data:{duplicate:true},error:null,status:200}) as unknown as ReturnType<typeof supabase.rpc>);
 await expect(retryOperation(db,uuid(4),original)).resolves.toEqual({duplicate:true});expect(await pendingOperations(db)).toEqual([]);expect(rpc.mock.calls.at(-1)).toEqual(["agri_command",{action:"receive_stock",data:original.data}]);
});
