import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../apps/web/lib/api", () => ({ command: vi.fn() }));
import { command } from "../../apps/web/lib/api";
import {
  onlineOperation,
  pendingOperations,
  retryOperation,
} from "../../apps/web/lib/operations";
import { setupDB, uuid, sale } from "./fixtures";
import { PosDatabase, exportRecovery, importRecovery, saveCheckout, setSetting } from "@agristore/offline";
const databases: PosDatabase[] = [];
const body = {
  organizationId: uuid(1),
  branchId: uuid(2),
  reference: "DELIVERY-1",
  items: [{ quantity: "1" }],
};
async function db() {
  const d = await setupDB();
  databases.push(d);
  return d;
}
afterEach(async () => {
  vi.resetAllMocks();
  const opened = databases.splice(0);
  opened.forEach((d) => d.close());
  for (const d of new Map(opened.map((d) => [d.name, d])).values())
    await d.delete();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("online inventory operation recovery", () => {
  it("round-trips a serialized pending sale with optional metadata and retains its permanent identity", async () => {
    const source = await db(), target = await db();
    const original = await saveCheckout(source, sale());
    await source.sales.update(original.id, { error: undefined });
    const file = JSON.parse(JSON.stringify(await exportRecovery(source, { organizationId: uuid(1), branchId: uuid(2), cashierId: undefined })));
    await importRecovery(target, file, [], { organizationId: uuid(1), branchId: uuid(2), cashierId: uuid(4), role: "owner" });
    const restored = await target.sales.get(original.id);
    expect(restored?.id).toBe(original.id);
    expect(restored?.payload).toEqual(original.payload);
    expect(restored?.fingerprint).toBe(original.fingerprint);
  });
  it.each([true, false])("round-trips a serialized owner recovery file with optional fields (scoped: %s)", async (scoped) => {
    const source = await db(), target = await db();
    const data = { organizationId: uuid(1), branchId: uuid(2), exceptionId: uuid(91), expectedVersion: 0, assigneeId: uuid(4), dueOn: "2026-11-01", reason: "TEST inspect original documents" };
    vi.mocked(command).mockRejectedValueOnce(new Error("TEST response lost"));
    await expect(onlineOperation(source, uuid(4), "assign_stock_exception", data, "followUpId")).rejects.toThrow();
    const original = (await pendingOperations(source))[0];
    await setSetting(source, original.key, { ...original, error: undefined });
    const scope = scoped ? { organizationId: uuid(1), branchId: uuid(2), cashierId: undefined } : undefined;
    const downloaded = JSON.parse(JSON.stringify(await exportRecovery(source, scope)));
    await target.settings.delete("lease");
    await importRecovery(target, downloaded, [], { organizationId: uuid(1), branchId: uuid(2), cashierId: uuid(4), role: "owner" });
    const restored = (await pendingOperations(target))[0];
    expect(restored.data).toEqual(original.data);
    expect(restored.fingerprint).toBe(original.fingerprint);
    vi.mocked(command).mockResolvedValueOnce({ duplicate: true });
    await retryOperation(target, uuid(4), restored);
    expect(vi.mocked(command).mock.calls.at(-1)).toEqual(["assign_stock_exception", original.data]);
    expect(await pendingOperations(target)).toHaveLength(0);
  });
  it.each([
    {action:"record_loss_cost",data:{lossKey:"movement:123",expectedCostId:null,unitId:uuid(10),unitCostCentavos:"125000",zeroCostConfirmed:false,reference:"TEST invoice",reason:"TEST documented acquisition cost"},idField:"costEvidenceId"},
    {action:"assign_stock_exception",data:{exceptionId:uuid(91),assigneeId:uuid(4),dueOn:"2026-11-01",expectedVersion:0,reason:"TEST inspect supplier records"},idField:"followUpId"},
    {action:"note_stock_exception",data:{exceptionId:uuid(91),expectedVersion:1,reason:"TEST inspection still pending"},idField:"followUpId"},
    {action:"start_blind_count",data:{productId:uuid(10),batchId:null,reason:"TEST blind count"},idField:"countId"},
    {action:"record_blind_count",data:{countId:uuid(91),stage:"first",quantity:"0.25",notes:"TEST first weight"},idField:"observationId"},
    {action:"record_blind_count",data:{countId:uuid(91),stage:"recount",quantity:"0.25",notes:"TEST independent weight"},idField:"observationId"},
    {action:"approve_count",data:{countId:uuid(91),reason:"TEST independent approval"}},
    {action:"cancel_blind_count",data:{countId:uuid(91),reason:"TEST stock changed"}},
    {action:"create_branch",data:{name:"TEST new branch"},idField:"newBranchId"},
  ])("restores an interrupted $action with its original identity and fingerprint",async({action,data,idField})=>{
    const source=await db(),target=await db();
    const request={organizationId:uuid(1),...(action==='create_branch'?{}:{branchId:uuid(2)}),...data};
    vi.mocked(command).mockRejectedValueOnce(new Error("TEST committed response lost"));
    await expect(onlineOperation(source,uuid(4),action,request,idField)).rejects.toThrow("response lost");
    const original=(await pendingOperations(source))[0];
    const file=await exportRecovery(source,{organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(4)});
    expect(file.pendingOperations).toHaveLength(1);
    await importRecovery(target,file);await importRecovery(target,file);
    const restored=(await pendingOperations(target))[0];
    expect(restored).toEqual(original);
    vi.mocked(command).mockResolvedValueOnce({ok:true});
    await onlineOperation(target,uuid(4),action,request,idField);
    expect(vi.mocked(command).mock.calls.at(-1)).toEqual([action,original.data]);
    expect(await pendingOperations(target)).toHaveLength(0);
    expect(await pendingOperations(source)).toEqual([original]);
  });
  it("restores operation-only evidence for a signed-in stock counter without opening a shift",async()=>{
    const source=await db(),target=await db();
    vi.mocked(command).mockRejectedValueOnce(new Error("TEST response lost"));
    await expect(onlineOperation(source,uuid(4),'record_blind_count',{organizationId:uuid(1),branchId:uuid(2),countId:uuid(91),stage:'first',quantity:'0.25',notes:'TEST net weight'},'observationId')).rejects.toThrow();
    const file=await exportRecovery(source,{organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(4)});
    await target.settings.delete('lease');
    await importRecovery(target,file,[],{organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(4),role:'stock_staff'});
    expect(await pendingOperations(target)).toEqual(await pendingOperations(source));
    expect(await target.settings.get('lease')).toBeUndefined();
    await expect(importRecovery(target,file,[],{organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(6),role:'stock_staff'})).rejects.toThrow(/original employee|owner/);
    await expect(importRecovery(target,file,[],{organizationId:uuid(1),branchId:uuid(99),cashierId:uuid(4),role:'stock_staff'})).rejects.toThrow(/another business or branch/);
  });
  it("cannot replace an original employee's unresolved operation with another actor",async()=>{
    const source=await db(),target=await db();
    const data={organizationId:uuid(1),branchId:uuid(2),countId:uuid(91),reason:'TEST approval'};
    vi.mocked(command).mockRejectedValue(new Error('TEST lost response'));
    await expect(onlineOperation(source,uuid(4),'approve_count',data)).rejects.toThrow();
    await expect(onlineOperation(target,uuid(6),'approve_count',data)).rejects.toThrow();
    await setSetting(target,'lease',{organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(4),role:'owner',issuedAt:Date.now()-1000,expiresAt:Date.now()+10000});
    const before=await pendingOperations(target);
    await expect(importRecovery(target,await exportRecovery(source))).rejects.toThrow(/operation.*confirmation/i);
    expect(await pendingOperations(target)).toEqual(before);
  });
  it("keeps sale restoration shift-authorized even when operation-only recovery is allowed",async()=>{
    const target=await db();await target.settings.delete('lease');
    await expect(importRecovery(target,{version:1,sales:[{payload:sale()}]},[],{organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(4),role:'stock_staff'})).rejects.toThrow('Open a shift');
    expect(await target.sales.count()).toBe(0);
  });
  it("rejects conflicting operation identities in one archive before writing either",async()=>{
    const target=await db();
    const op={action:'approve_count',actorId:uuid(4),data:{organizationId:uuid(1),branchId:uuid(2),countId:uuid(91),reason:'TEST original approval'}};
    await expect(importRecovery(target,{version:1,sales:[],pendingOperations:[op,{...op,actorId:uuid(6)}]},[],{organizationId:uuid(1),branchId:uuid(2),cashierId:uuid(4),role:'owner'})).rejects.toThrow('conflicting operations');
    expect(await pendingOperations(target)).toEqual([]);
  });
  it.each(['2',3,null])("rejects unsupported recovery version %s before writing",async(version)=>{
    const target=await db();
    await expect(importRecovery(target,{version,sales:[]})).rejects.toThrow('Invalid recovery file');
    expect(await target.sales.count()).toBe(0);
  });
  it("two windows reuse one durable ID for the same unconfirmed delivery", async () => {
    const first = await db();
    const second = new PosDatabase(first.name);
    databases.push(second);
    await second.open();
    const started = deferred<void>();
    const response = deferred<Record<string, unknown>>();
    let requests = 0;
    vi.mocked(command).mockImplementation(async () => {
      if (++requests === 2) started.resolve();
      return response.promise;
    });
    const uploads = Promise.all([
      onlineOperation(first, uuid(4), "receive_stock", body, "receiptId"),
      onlineOperation(second, uuid(4), "receive_stock", body, "receiptId"),
    ]);
    await started.promise;
    const ids = vi.mocked(command).mock.calls.map(([, data]) => data.receiptId);
    response.resolve({ ok: true });
    await uploads;
    expect(new Set(ids).size).toBe(1);
    expect(await pendingOperations(first)).toHaveLength(0);
  });
  it.each(["success", "failure"])(
    "a late %s for an old request cannot erase or replace a newer pending request",
    async (outcome) => {
      const d = await db();
      vi.mocked(command).mockRejectedValueOnce(new Error("Response lost"));
      await onlineOperation(d, uuid(4), "receive_stock", body, "receiptId").catch(() => {});
      const old = (await pendingOperations(d))[0];
      const started = deferred<void>();
      const response = deferred<Record<string, unknown>>();
      vi.mocked(command).mockImplementationOnce(async () => {
        started.resolve();
        return response.promise;
      });
      const slow = retryOperation(d, uuid(4), old).catch(() => {});
      await started.promise;
      vi.mocked(command).mockResolvedValueOnce({ ok: true });
      await retryOperation(d, uuid(4), old);
      vi.mocked(command).mockRejectedValueOnce(new Error("New delivery response lost"));
      await onlineOperation(d, uuid(4), "receive_stock", { ...body, reference: "DELIVERY-2" }, "receiptId").catch(() => {});
      const newer = (await pendingOperations(d))[0];
      if (outcome === "success") response.resolve({ ok: true });
      else response.reject(new Error("Late old timeout"));
      await slow;
      expect(await pendingOperations(d)).toEqual([newer]);
      expect(newer.data.receiptId).not.toBe(old.data.receiptId);
    },
  );
  it("retries an ambiguous response using its original receipt ID", async () => {
    const d = await db();
    vi.mocked(command).mockRejectedValueOnce(new Error("Response lost"));
    await expect(
      onlineOperation(d, uuid(4), "receive_stock", body, "receiptId"),
    ).rejects.toThrow();
    const original = (await pendingOperations(d))[0];
    vi.mocked(command).mockResolvedValueOnce({ ok: true });
    await onlineOperation(d, uuid(4), "receive_stock", body, "receiptId");
    expect(vi.mocked(command).mock.calls[1][1].receiptId).toBe(
      original.data.receiptId,
    );
    expect(await pendingOperations(d)).toHaveLength(0);
  });
  it("clears definitively rejected transactions so corrected input can be submitted", async () => {
    const d = await db();
    vi.mocked(command).mockRejectedValueOnce(
      Object.assign(new Error("Invalid batch"), { code: "P0001" }),
    );
    await expect(
      onlineOperation(d, uuid(4), "receive_stock", body, "receiptId"),
    ).rejects.toThrow();
    expect(await pendingOperations(d)).toHaveLength(0);
  });
  it("preserves the unknown result rather than starting a changed duplicate", async () => {
    const d = await db();
    vi.mocked(command).mockRejectedValueOnce(new Error("Network interrupted"));
    await expect(
      onlineOperation(d, uuid(4), "receive_stock", body, "receiptId"),
    ).rejects.toThrow();
    await expect(
      onlineOperation(
        d,
        uuid(4),
        "receive_stock",
        { ...body, reference: "Changed" },
        "receiptId",
      ),
    ).rejects.toThrow("earlier operation");
    expect(vi.mocked(command)).toHaveBeenCalledTimes(1);
  });
  it("requires the original employee for recovery", async () => {
    const d = await db();
    vi.mocked(command).mockRejectedValueOnce(new Error("Network interrupted"));
    await expect(
      onlineOperation(d, uuid(4), "receive_stock", body, "receiptId"),
    ).rejects.toThrow();
    await expect(
      retryOperation(d, uuid(5), (await pendingOperations(d))[0]),
    ).rejects.toThrow("employee");
    expect(vi.mocked(command)).toHaveBeenCalledTimes(1);
  });
});
