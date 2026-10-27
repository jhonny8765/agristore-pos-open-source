import {requireLease,type Lease,type Role} from "@agristore/domain";
import {setting,unresolvedStates,type PosDatabase,type SyncState} from "@agristore/offline";
import type {PendingOperation} from "./operations";

export interface OperatingScope { organizationId:string; branchId:string; actorId:string; role:Role }
export interface LocalOperatingStatus {
  sales:Partial<Record<SyncState,number>>; operations:number; otherRecords:number;
  productCount:number; snapshotAt?:string; lastSync?:string; lease?:Lease;
  oldestSaleAt?:number; invalidSaleTimes?:number;
}
/** Aggregate every unresolved record, independent of the recent-receipt page.
 * Return counts only; another employee's request contents stay private. */
export async function readOperatingStatus(db:PosDatabase,scope:OperatingScope):Promise<LocalOperatingStatus>{
 return db.transaction("r",[db.sales,db.settings,db.products],async()=>{
  const sales:LocalOperatingStatus["sales"]={};let operations=0,otherRecords=0,oldestSaleAt:number|undefined,invalidSaleTimes=0;
  const visible=(org:unknown,branch:unknown,actor:unknown)=>org===scope.organizationId&&(!branch||branch===scope.branchId)&&(scope.role==="owner"||actor===scope.actorId);
  await db.sales.where("status").anyOf(unresolvedStates).each(s=>{
   if(visible(s.payload.organizationId,s.payload.branchId,s.payload.cashierId)){
    sales[s.status]=(sales[s.status]??0)+1;
    // Retries change updatedAt. Age must follow the original saved purchase.
    const savedAt=Date.parse(s.payload.occurredAt);
    if(Number.isFinite(savedAt))oldestSaleAt=oldestSaleAt===undefined?savedAt:Math.min(oldestSaleAt,savedAt);else invalidSaleTimes++;
   }else otherRecords++;
  });
  await db.settings.where("key").startsWith("operation:").each(row=>{const op=row.value as PendingOperation;if(visible(op.data.organizationId,op.data.branchId,op.actorId))operations++;else otherRecords++;});
  return {sales,operations,otherRecords,oldestSaleAt,invalidSaleTimes,productCount:await db.products.count(),snapshotAt:await setting<string>(db,"snapshotAsOf"),lastSync:await setting<string>(db,"lastSync"),lease:await setting<Lease>(db,"lease")};
 });
}
export interface BrowserStorageStatus { persistent?:boolean; usage?:number; quota?:number }
export interface OperatingCheck { id:string; title:string; state:"Check passed"|"Action needed"|"Review"|"Information"; detail:string }
export function operatingChecks(input:{scope:OperatingScope;local:LocalOperatingStatus;storage:BrowserStorageStatus;online:boolean;cached:boolean;practice:boolean;now:number}):OperatingCheck[]{
 const {scope,local,storage,online,cached,practice,now}=input;const result:OperatingCheck[]=[];
 const add=(id:string,title:string,state:OperatingCheck["state"],detail:string)=>result.push({id,title,state,detail});
 add("connection","Connection","Information",online?"This browser reports a connection. Only a successful server response confirms store access; a Wi-Fi icon alone does not.":"Offline: continue only the same authorized cashier shift. New sign-ins, shift opening/closure, refunds and stock changes require connectivity.");
 const unresolved=Object.values(local.sales).reduce((sum,n)=>sum+(n??0),0);
 if(unresolved){
  const age=local.oldestSaleAt===undefined?undefined:Math.floor((now-local.oldestSaleAt)/60_000);
  const clockIssue=!!local.invalidSaleTimes||age===undefined||!Number.isFinite(age)||local.oldestSaleAt!>now+60_000;
  add("queue-age","Time waiting for confirmation",clockIssue?"Review":online&&age!>=15?"Action needed":"Review",clockIssue?"The age of one or more saved sales cannot be verified against this PC's clock. Preserve the records, check Windows automatic time and ask the maintainer to investigate. Do not change time to extend a shift.":`The oldest unconfirmed sale was saved ${Math.max(0,age!)} minutes ago. ${online&&age!>=15?"This browser reports a connection, but this sale has waited at least 15 minutes. Open Sync center, check access and server availability, and contact the maintainer if the original record cannot be confirmed.":online?"Check Sync center for confirmation of the original records.":"Reconnect when available and confirm the original records; an intentional outage can leave sales waiting."} Do not repeat the purchase or clear site data.`);
 }
 add("queue","Saved sales",!scope.branchId||local.sales.authentication_required||local.sales.review_required?"Action needed":unresolved?"Review":"Check passed",!scope.branchId?"The downloaded branch is not identified. Reconnect before reviewing saved sales; an empty view does not establish an empty queue. Preserve this profile and do not repeat completed purchases.":unresolved?`${unresolved} unconfirmed sales in your permitted branch view: ${local.sales.authentication_required??0} need sign-in, ${local.sales.review_required??0} need owner review, ${local.sales.retryable??0} need retry; others are pending or sending. Open Sync center and resolve the original records. Do not enter them again.`:"No unconfirmed sales in your permitted branch view. This does not prove physical cash or stock reconciles.");
 add("operations","Unconfirmed stock / owner requests",!scope.branchId||local.operations?"Action needed":"Check passed",!scope.branchId?"Reconnect to identify the saved branch before reviewing stock requests. Original requests remain on this PC.":local.operations?`${local.operations} original requests need confirmation in Sync center. Sign in as the employee who started each request and retry its original ID. Keep recovery files private.`:"No unconfirmed requests in your permitted branch view.");
 if(local.otherRecords)add("other","Other records on this PC","Action needed",`${local.otherRecords} unresolved records belong to another branch, business or employee view. Ask the owner to recover them using the original account. Do not clear site data or reinstall to remove them.`);
 const snapshot=Date.parse(local.snapshotAt??"");
 add("catalog","Stock and catalog",!Number.isFinite(snapshot)||!local.productCount?"Action needed":snapshot>now+60_000||now-snapshot>24*3600_000?"Review":"Information",!Number.isFinite(snapshot)||!local.productCount?"No complete saved catalog is available. Reconnect and refresh stock and catalog before checkout.":snapshot>now+60_000?"The saved snapshot appears ahead of the PC clock. Check Windows automatic time; do not change time to extend authorization.":`${local.productCount} catalog products. Saved snapshot: ${new Date(snapshot).toLocaleString("en-PH",{timeZone:"Asia/Manila"})} (Asia/Manila). ${now-snapshot>24*3600_000?"Older than 24 hours; refresh online and check current prices, lots and quantities.":"Refresh online before opening and after reconnecting. Offline stock is a local estimate; inspect the actual goods."}`);
 if(scope.role==="stock_staff")add("shift","Cashier authorization","Information","Your stock-staff role cannot complete sales. Use your assigned stock workflows; cashiers sign in separately.");
 else if(!local.lease)add("shift","Cashier authorization","Information","No shift is saved on this PC. Open your own shift online from Checkout before selling.");
 else {
  const l=local.lease;let invalid="";
  if(l.organizationId!==scope.organizationId||l.branchId!==scope.branchId||l.cashierId!==scope.actorId)invalid="The saved shift belongs to another account or branch. Preserve its records and ask the owner to reconcile it; do not sell under another cashier's identity.";
  else if(!Number.isFinite(l.issuedAt)||!Number.isFinite(l.expiresAt))invalid="The saved authorization time cannot be verified. Reconnect and ask the owner to review it.";
  else {try{requireLease(l,now);}catch(e){invalid=e instanceof Error?e.message:"Renew shift authorization online.";}}
  const minutes=Math.max(0,Math.floor((l.expiresAt-now)/60_000));
  add("shift","Cashier authorization",invalid?"Action needed":minutes<=60?"Review":"Information",invalid||`${minutes} minutes remain; expires ${new Date(l.expiresAt).toLocaleString("en-PH",{timeZone:"Asia/Manila"})} (Asia/Manila). ${minutes<=60?"Reconnect and renew offline authorization in Cashier shift now.":"Renew online before a planned interruption. An expired shift cannot save a new sale; completed records stay recoverable."}`);
 }
 const validSpace=Number.isFinite(storage.usage)&&storage.usage!>=0&&Number.isFinite(storage.quota)&&storage.quota!>0;
 const low=validSpace&&(storage.usage!/storage.quota!>=0.8||storage.quota!-storage.usage!<50*1024*1024);
 add("storage","Browser storage",low||storage.persistent===false?"Action needed":storage.persistent===true&&validSpace?"Information":"Review",`${storage.persistent===true?"Storage protection is granted.":storage.persistent===false?"Storage protection is not granted. Check storage protection below and complete the actual PC tests before live use.":"Storage protection could not be verified."} ${validSpace?`${Math.round(storage.usage!/storage.quota!*100)}% of estimated browser quota used.`:"Space estimate unavailable."} ${low?"Space is low. Synchronize and export unresolved records; ask the maintainer to free space without deleting this site's data.":"Browser estimates do not measure Windows free disk space or protect against drive failure."}`);
 add("cache","Offline application shell",cached?"Information":"Review",cached?"A service worker is active. This is not an offline launch test; verify this exact PC and profile during an actual outage and Windows restart.":"No active application cache is reported. Reconnect, finish pending work, install/update from this profile and test offline launch before live use.");
 if(practice)add("practice","Practice mode","Information","This is a local practice business. Its checks and sales do not establish real stock, staff permissions, live synchronization or production readiness.");
 return result;
}
