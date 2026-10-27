import "fake-indexeddb/auto";
import {afterEach,describe,expect,it} from "vitest";
import {setSetting,type PosDatabase} from "@agristore/offline";
import {operatingChecks,readOperatingStatus,type LocalOperatingStatus,type OperatingScope} from "../../apps/web/lib/operating-checks";
import {supportReport} from "../../apps/web/lib/support-report";
import {commandError} from "../../apps/web/lib/command-error";
import {lease,sale,setupDB,uuid} from "./fixtures";
const now=Date.parse("2026-10-28T00:00:00Z"),scope:OperatingScope={organizationId:uuid(1),branchId:uuid(2),actorId:uuid(4),role:"cashier"};
const local=():LocalOperatingStatus=>({sales:{},operations:0,otherRecords:0,productCount:1,snapshotAt:new Date(now).toISOString(),lease:lease(now)});
function checks(l=local(),extra:Partial<Parameters<typeof operatingChecks>[0]>={}){return operatingChecks({scope,local:l,storage:{persistent:true,usage:1,quota:1024**3},online:true,cached:true,practice:false,now,...extra});}
const opened:PosDatabase[]=[];afterEach(async()=>{for(const db of opened.splice(0)){db.close();await db.delete();}});
describe("operating checks preserve uncertainty and private record boundaries",()=>{
 it("does not call an unidentified branch's saved records or stock requests clear",()=>{const rows=checks(local(),{scope:{...scope,branchId:""}});for(const id of ["queue","operations"]){const row=rows.find(r=>r.id===id)!;expect(row.state).toBe("Action needed");expect(row.detail).toContain("Reconnect");}expect(rows.find(r=>r.id==="queue")?.detail).not.toContain("No unconfirmed");});
 it("does not convert network, storage or installed cache into launch certification",()=>{const rows=checks();expect(rows.filter(r=>r.state==="Check passed").map(r=>r.id)).toEqual(["queue","operations"]);expect(rows.find(r=>r.id==="connection")?.detail).toContain("Only a successful server response");expect(rows.find(r=>r.id==="cache")?.detail).toContain("not an offline launch test");});
 it.each(["authentication_required","review_required"] as const)("flags %s without calling the queue clear",status=>{const l=local();l.sales[status]=2;const row=checks(l).find(r=>r.id==="queue")!;expect(row.state).toBe("Action needed");expect(row.detail).toContain("2 unconfirmed");});
 it("retains ordinary pending and other-account warnings separately",()=>{const l=local();l.sales.pending=3;l.operations=1;l.otherRecords=2;const rows=checks(l);expect(rows.find(r=>r.id==="queue")?.state).toBe("Review");expect(rows.find(r=>r.id==="operations")?.state).toBe("Action needed");expect(rows.find(r=>r.id==="other")?.detail).toContain("2 unresolved records");});
 it.each([undefined,"invalid",new Date(now-25*3600_000).toISOString(),new Date(now+120_000).toISOString()])("does not present missing/stale/future snapshot %s as current",snapshotAt=>{const l=local();l.snapshotAt=snapshotAt;expect(checks(l).find(r=>r.id==="catalog")?.state).not.toBe("Information");});
 it.each([0,-1,NaN])("refuses an invalid or expired authorization %s",remaining=>{const l=local();l.lease!.expiresAt=now+remaining;expect(checks(l).find(r=>r.id==="shift")?.state).toBe("Action needed");});
 it("warns at one hour and becomes expired as real time passes",()=>{const l=local();l.lease!.expiresAt=now+3600_000;expect(checks(l).find(r=>r.id==="shift")?.state).toBe("Review");expect(checks(l,{now:now+3600_000}).find(r=>r.id==="shift")?.state).toBe("Action needed");});
 it.each(["cashierId","branchId","organizationId"] as const)("does not borrow another %s authorization",field=>{const l=local();l.lease![field]=uuid(99);expect(checks(l).find(r=>r.id==="shift")?.detail).toContain("another account or branch");});
 it("keeps closed-shift and stock-staff work distinct from checkout",()=>{const l=local();delete l.lease;expect(checks(l).find(r=>r.id==="shift")?.detail).toContain("Open your own shift online");expect(checks(l,{scope:{...scope,role:"stock_staff"}}).find(r=>r.id==="shift")?.detail).toContain("cannot complete sales");});
 it.each([{persistent:false},{persistent:true,usage:900,quota:1000},{persistent:true,usage:0,quota:1024}])("flags unprotected or low storage %j",storage=>expect(checks(local(),{storage}).find(r=>r.id==="storage")?.state).toBe("Action needed"));
 it("reports unavailable storage and missing catalog without assuming a pass",()=>{const l=local();l.productCount=0;expect(checks(l,{storage:{}}).find(r=>r.id==="storage")?.state).toBe("Review");expect(checks(l).find(r=>r.id==="catalog")?.state).toBe("Action needed");});
 it("aggregates all unresolved records and reveals no other employee's payload",async()=>{
  const db=await setupDB();opened.push(db);const original=sale();const record={id:original.transactionId,payload:original,fingerprint:"TEST",status:"pending" as const,attempts:0,nextAttempt:0,updatedAt:now};
  for(let n=0;n<55;n++){const id=uuid(100+n);await db.sales.put({...record,id,payload:{...original,transactionId:id}});}
  await db.sales.put({...record,id:uuid(201),payload:{...original,transactionId:uuid(201),cashierId:uuid(9)},status:"authentication_required"});
  await db.sales.put({...record,id:uuid(202),payload:{...original,transactionId:uuid(202),branchId:uuid(90)}});
  await setSetting(db,"operation:own",{data:{organizationId:uuid(1),branchId:uuid(2)},actorId:uuid(4)});await setSetting(db,"operation:other",{data:{organizationId:uuid(1),branchId:uuid(2),secret:"PRIVATE evidence"},actorId:uuid(9)});
  const before=await db.sales.toArray();const staff=await readOperatingStatus(db,scope);expect(staff.sales.pending).toBe(55);expect(staff.operations).toBe(1);expect(staff.otherRecords).toBe(3);expect(JSON.stringify(staff)).not.toContain("PRIVATE evidence");
  const owner=await readOperatingStatus(db,{...scope,role:"owner"});expect(owner.sales.authentication_required).toBe(1);expect(owner.operations).toBe(2);expect(owner.otherRecords).toBe(1);expect(await db.sales.toArray()).toEqual(before);
 });
});
describe("online error guidance retains error identity",()=>{
 it.each(["PGRST301","PGRST302","PGRST303"])("explains %s without requesting another sale",code=>{const e=commandError({message:"JWT expired",code},401);expect(e.code).toBe(code);expect(e.authenticationRequired).toBe(true);expect(e.message).toContain("original employee");expect(e.message).toContain("Signing out clears an unfinished basket");});
 it("distinguishes denied permissions from an expired JWT",()=>{const e=commandError({message:"Only the owner may approve",code:"42501"},403);expect(e.authenticationRequired).toBe(false);expect(e.message).toContain("Only the owner may approve");expect(e.code).toBe("42501");});
 it("preserves validation/network errors for existing retry rules",()=>{expect(commandError({message:"Document changed",code:"P0001"},400).message).toBe("Document changed");expect(commandError({message:"Failed to fetch"},0).message).toBe("Failed to fetch");});
});


describe("maintainer warnings and private support reports",()=>{
 it("escalates a connected sale at fifteen minutes without declaring a server failure",()=>{
  const l=local();l.sales.pending=1;l.oldestSaleAt=now-15*60_000;
  const row=checks(l).find(r=>r.id==="queue-age")!;
  expect(row.state).toBe("Action needed");expect(row.detail).toContain("15 minutes");expect(row.detail).toContain("reports a connection");
  expect(row.detail).toContain("Do not repeat the purchase");
  const offline=checks(l,{online:false}).find(r=>r.id==="queue-age")!;
  expect(offline.state).toBe("Review");expect(offline.detail).toContain("intentional outage");
 });
 it("keeps a recent connected sale under review and flags an unverified clock",()=>{
  const l=local();l.sales.sending=1;l.oldestSaleAt=now-14*60_000;
  expect(checks(l).find(r=>r.id==="queue-age")?.state).toBe("Review");
  l.oldestSaleAt=now+120_000;expect(checks(l).find(r=>r.id==="queue-age")?.detail).toContain("automatic time");
  l.oldestSaleAt=now;l.invalidSaleTimes=1;expect(checks(l).find(r=>r.id==="queue-age")?.detail).toContain("cannot be verified");
 });
 it("ages original scoped purchases, excluding confirmed and other-view records despite recent retries",async()=>{
  const db=await setupDB();opened.push(db);
  for(const [id,age,status,branchId] of [[401,25,"retryable",scope.branchId],[402,5,"pending",scope.branchId],[403,90,"synced",scope.branchId],[404,120,"review_required",uuid(99)]] as const){
   const payload=sale({transactionId:uuid(id),branchId,occurredAt:new Date(now-age*60_000).toISOString()});
   await db.sales.put({id:payload.transactionId,payload,fingerprint:"TEST",status,updatedAt:now,attempts:9,nextAttempt:now});
  }
  const before=await db.sales.toArray();const status=await readOperatingStatus(db,scope);
  expect(status.oldestSaleAt).toBe(now-25*60_000);expect(status.otherRecords).toBe(1);expect(status.sales.synced).toBeUndefined();
  expect(await db.sales.toArray()).toEqual(before);
 });
 it("counts invalid sale times without exposing payload contents",async()=>{
  const db=await setupDB();opened.push(db);const payload=sale({occurredAt:"INVALID PRIVATE TIMESTAMP"});
  await db.sales.put({id:payload.transactionId,payload,fingerprint:"PRIVATE",status:"pending",updatedAt:now,attempts:0,nextAttempt:0});
  const status=await readOperatingStatus(db,scope);expect(status.invalidSaleTimes).toBe(1);expect(status.oldestSaleAt).toBeUndefined();
  const report=supportReport({scope,local:status,storage:{},online:true,cached:true,practice:false,now},"TEST-release");
  expect(JSON.stringify(report)).not.toContain("PRIVATE");expect(report.oldestUnconfirmedSaleAt).toBeNull();
 });
 it("exports only allowed health fields without credentials, employee identities or record payloads",()=>{
  const l=local();l.sales.pending=2;l.operations=1;l.oldestSaleAt=now-20*60_000;
  l.lease!.name="PRIVATE employee";
  Object.assign(l,{payload:{secret:"PRIVATE sale contents"},error:"PRIVATE token",fingerprint:"PRIVATE fingerprint"});
  const report=supportReport({scope,local:l,storage:{persistent:true,usage:100,quota:1024**3},online:true,cached:true,practice:false,now},"TEST-release");
  const json=JSON.stringify(report);expect(json).not.toContain("PRIVATE");expect(json).not.toContain(scope.actorId);expect(json).not.toContain(l.lease!.deviceId);
  expect(report.scope).toEqual({organizationId:scope.organizationId,branchId:scope.branchId,role:"cashier"});
  expect(report.sales.pending).toBe(2);expect(report.unconfirmedStockRequests).toBe(1);expect(report.appRelease).toBe("TEST-release");
  expect(report.checkedAt).toBe(new Date(now).toISOString());expect(report.limits).toContain("not a recovery file");
 });
 it("retains unknown observations as null and makes no backup or online-server claim",()=>{
  const l=local();delete l.lease;l.snapshotAt="INVALID";l.lastSync="INVALID";
  const report=supportReport({scope,local:l,storage:{usage:NaN,quota:Infinity},online:true,cached:false,practice:true,now},"local-build");
  expect(report.storage).toEqual({persistent:null,usageBytes:null,quotaBytes:null});expect(report.catalog.snapshotAt).toBeNull();expect(report.lastSuccessfulSyncAt).toBeNull();
  expect(report.authorization).toEqual({saved:false,expiresAt:null});expect(report.mode).toBe("practice");expect(report.limits).toContain("does not verify server access");
 });
});
