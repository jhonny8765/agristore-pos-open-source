import {unresolvedStates} from "@agristore/offline";
import {operatingChecks} from "./operating-checks";

function date(value: string | number | undefined) {
  const time=typeof value==="number"?value:Date.parse(value??"");
  return Number.isFinite(time)&&Math.abs(time)<=8.64e15?new Date(time).toISOString():null;
}
function count(value:number|undefined){return Number.isSafeInteger(value)&&value!>=0?value!:0;}

/** Explicit allowlist: never serialize local records, leases, errors or tokens.
 * This report is observational. It cannot restore a sale or certify backups. */
export function supportReport(input:Parameters<typeof operatingChecks>[0],release:string){
  const {scope,local,storage}=input;
  return {
    format:"agristore-support",version:1,checkedAt:date(input.now),appRelease:release,
    mode:input.practice?"practice":"live",
    scope:{organizationId:scope.organizationId,branchId:scope.branchId,role:scope.role},
    browserOnline:input.online,offlineShellActive:input.cached,
    sales:Object.fromEntries(unresolvedStates.map(state=>[state,count(local.sales[state])])),
    unconfirmedStockRequests:count(local.operations),otherUnresolvedRecords:count(local.otherRecords),
    oldestUnconfirmedSaleAt:date(local.oldestSaleAt),invalidSaleTimes:count(local.invalidSaleTimes),
    catalog:{productCount:count(local.productCount),snapshotAt:date(local.snapshotAt)},
    lastSuccessfulSyncAt:date(local.lastSync),
    authorization:{saved:!!local.lease,expiresAt:date(local.lease?.expiresAt)},
    storage:{persistent:storage.persistent??null,usageBytes:Number.isFinite(storage.usage)&&storage.usage!>=0?storage.usage:null,quotaBytes:Number.isFinite(storage.quota)&&storage.quota!>0?storage.quota:null},
    checks:operatingChecks(input),
    limits:"Local observations and permitted counts only. Browser online does not verify server access. This is not a recovery file, production backup check or launch approval. No report is sent automatically.",
  };
}
