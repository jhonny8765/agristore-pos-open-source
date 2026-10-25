export interface BlindCount {
  id: string; productId: string; batchId: string | null;
  state: 'first_count' | 'recount' | 'ready' | 'disputed' | 'approved' | 'cancelled';
  reason: string; createdAt: string; startedBy: string; firstCounter: string | null; recounter: string | null;
  firstCounterName: string | null; recounterName: string | null;
  stale: boolean; expected: string | null; counted: string | null; recounted: string | null;
  firstNotes: string | null; recountNotes: string | null; cancelledReason: string | null;
}
export const countState = {first_count:'First count needed',recount:'Independent recount needed',ready:'Ready for owner review',disputed:'Counts disagree — fresh count needed',approved:'Approved',cancelled:'Closed without adjustment'};
export function countLabel(row:BlindCount,products:Product[]){
 const product=products.find(p=>p.id===row.productId),batch=product?.batches.find(b=>b.id===row.batchId);
 const lot=row.batchId===null ? 'No lot' : batch ? `Lot ${batch.lot} · Expiry: ${batch.expiresOn ?? 'not recorded'}` : `Recorded lot ${row.batchId} · Expiry unavailable`;
 return `${product?.name ?? `Recorded product ${row.productId}`} · ${lot} (${product?.baseUnit ?? 'base units'})`;
}
export function canApproveCount(row: BlindCount, actorId: string, owner: boolean) {
  return owner && row.state === 'ready' && !row.stale && !!row.firstCounter && !!row.recounter &&
    row.firstCounter !== row.recounter && actorId !== row.firstCounter && actorId !== row.recounter;
}
export function countPage(rows: BlindCount[]) {
  const visible = rows.slice(0,50), last = visible.at(-1);
  return {rows:visible,next:rows.length>50 && last ? {beforeAt:last.createdAt,beforeId:last.id} : undefined};
}
import type {Product} from '@agristore/domain';
