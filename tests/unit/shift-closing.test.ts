import "fake-indexeddb/auto";
import {afterEach,expect,it,vi} from "vitest";
vi.mock("../../apps/web/lib/api",()=>({command:vi.fn()}));
import {command} from "../../apps/web/lib/api";
import {onlineOperation,pendingOperations,retryOperation} from "../../apps/web/lib/operations";
import {PosDatabase,exportRecovery,importRecovery,saveCheckout,setSetting,setting} from "@agristore/offline";
import {lease,sale,setupDB,uuid} from "./fixtures";
const opened:PosDatabase[]=[];
async function db(){const d=await setupDB();opened.push(d);return d;}
const closing=()=>({organizationId:uuid(1),branchId:uuid(2),shiftId:uuid(5),countedCash:3200});
afterEach(async()=>{vi.resetAllMocks();for(const d of opened.splice(0)){d.close();await d.delete();}});

it.each(["pending","sending","authentication_required","retryable","review_required"] as const)("blocks closing with an old %s sale even beyond the displayed history",async status=>{
 const d=await db(),original=await saveCheckout(d,sale({occurredAt:"2026-01-01T00:00:00Z"}));await d.sales.update(original.id,{status});
 for(let i=0;i<55;i++){const s=await saveCheckout(d,sale());await d.sales.update(s.id,{status:"synced"});}
 await expect(onlineOperation(d,uuid(4),"close_shift",closing())).rejects.toThrow("Synchronize every saved sale");expect(command).not.toHaveBeenCalled();expect(await d.sales.get(original.id)).toMatchObject({status});expect(await pendingOperations(d)).toEqual([]);
});
it("waits for a refund with an unknown outcome rather than closing against uncertain cash",async()=>{
 const d=await db();vi.mocked(command).mockRejectedValueOnce(new Error("TEST refund response lost"));
 await expect(onlineOperation(d,uuid(4),"partial_refund_sale",{...closing(),saleId:uuid(80)},"refundId")).rejects.toThrow("response lost");
 const before=await pendingOperations(d);await expect(onlineOperation(d,uuid(4),"close_shift",closing())).rejects.toThrow("stock or refund request");expect(command).toHaveBeenCalledOnce();expect(await pendingOperations(d)).toEqual(before);
});
it("retains counted cash, blocks new sales/changes and replays the original close after a lost response",async()=>{
 const d=await db();vi.mocked(command).mockRejectedValueOnce(new Error("TEST closing response lost"));
 await expect(onlineOperation(d,uuid(4),"close_shift",closing())).rejects.toThrow("response lost");const [original]=await pendingOperations(d);
 await expect(saveCheckout(d,sale())).rejects.toThrow("Shift closing is awaiting confirmation");
 await expect(onlineOperation(d,uuid(4),"receive_stock",{...closing(),reference:"TEST new delivery"},"receiptId")).rejects.toThrow("Shift closing is awaiting confirmation");
 await expect(onlineOperation(d,uuid(4),"close_shift",{...closing(),countedCash:999})).rejects.toThrow("earlier operation");
 expect(await d.sales.count()).toBe(0);expect(await setting(d,"lease")).toBeDefined();
 vi.mocked(command).mockResolvedValueOnce({expected_cash:3200,counted_cash:3200});await retryOperation(d,uuid(4),original);
 expect(vi.mocked(command).mock.calls.at(-1)).toEqual(["close_shift",closing()]);expect(await pendingOperations(d)).toEqual([]);expect(await setting(d,"lease")).toBeUndefined();
});
it("restores an operation-only close with the original shift and cash while shifts remain closed",async()=>{
 const source=await db(),target=await db();vi.mocked(command).mockRejectedValueOnce(new Error("TEST lost"));await expect(onlineOperation(source,uuid(4),"close_shift",closing())).rejects.toThrow();
 const original=(await pendingOperations(source))[0];const file=JSON.parse(JSON.stringify(await exportRecovery(source)));await target.settings.delete("lease");
 const actor={organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(4),role:"cashier" as const};await importRecovery(target,file,[],actor);await importRecovery(target,file,[],actor);
 expect((await pendingOperations(target))[0]).toEqual(original);vi.mocked(command).mockResolvedValueOnce({expected_cash:3200,counted_cash:3200});await retryOperation(target,uuid(4),original);expect(await pendingOperations(target)).toEqual([]);expect(await setting(target,"lease")).toBeUndefined();expect(await pendingOperations(source)).toEqual([original]);
});
it("preserves the saved shift after an authoritative closing rollback",async()=>{
 const d=await db(),before=await setting(d,"lease");vi.mocked(command).mockRejectedValueOnce({code:"P0001",message:"TEST rollback"});await expect(onlineOperation(d,uuid(4),"close_shift",closing())).rejects.toMatchObject({code:"P0001"});expect(await pendingOperations(d)).toEqual([]);expect(await setting(d,"lease")).toEqual(before);
});
it("cannot clear a newer saved shift when an older closing response arrives late",async()=>{
 const d=await db();vi.mocked(command).mockImplementationOnce(async()=>{await setSetting(d,"lease",{...lease(),shiftId:uuid(90)});return {expected_cash:3200,counted_cash:3200};});await onlineOperation(d,uuid(4),"close_shift",closing());expect((await setting<ReturnType<typeof lease>>(d,"lease"))?.shiftId).toBe(uuid(90));
});
it("allows online closure of an expired authorization but rejects a changed cashier or invalid counted cash",async()=>{
 const d=await db();await setSetting(d,"lease",{...lease(),expiresAt:Date.now()-1000});await expect(onlineOperation(d,uuid(99),"close_shift",closing())).rejects.toThrow("saved shift changed");await expect(onlineOperation(d,uuid(4),"close_shift",{...closing(),countedCash:-1})).rejects.toThrow("valid centavos");vi.mocked(command).mockResolvedValueOnce({expected_cash:3200,counted_cash:3200});await onlineOperation(d,uuid(4),"close_shift",closing());expect(command).toHaveBeenCalledOnce();
});
it("serializes a concurrent refund and close before either network response",async()=>{
 const d=await db();vi.mocked(command).mockRejectedValue(new Error("TEST uncertain"));const outcomes=await Promise.allSettled([onlineOperation(d,uuid(4),"close_shift",closing()),onlineOperation(d,uuid(4),"partial_refund_sale",{...closing(),saleId:uuid(80)},"refundId")]);expect(outcomes.every(r=>r.status==="rejected")).toBe(true);expect(command).toHaveBeenCalledOnce();expect(await pendingOperations(d)).toHaveLength(1);
});
