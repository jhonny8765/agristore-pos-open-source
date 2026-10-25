"use client";

// Extend the cooperative stock book: sealed entry first; comparisons and approval in a separate review view.
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import Decimal from 'decimal.js';
import type {Product} from '@agristore/domain';
import type {PosDatabase} from '@agristore/offline';
import {command} from '../lib/api';
import {onlineOperation} from '../lib/operations';
import {canApproveCount,countPage,countState,countLabel,type BlindCount} from '../lib/blind-counts';
import {ApprovalForm} from './approval-form';
import {Button} from './ui/button';

type Page = {rows:BlindCount[];openCount:number};
const field = (f:FormData,name:string) => String(f.get(name) ?? '').trim();
export function BlindCounts({db,organizationId,branchId,actorId,products,owner,online,disabled,revision,execute,children}: {
 db:PosDatabase;organizationId:string;branchId:string;actorId:string;products:Product[];owner:boolean;
 online:boolean;disabled:boolean;revision:number;execute:(fn:()=>Promise<void>)=>Promise<Error|undefined>;children?:ReactNode;
}) {
 const [rows,setRows]=useState<BlindCount[]>([]),[next,setNext]=useState<ReturnType<typeof countPage>['next']>();
 const [openCount,setOpenCount]=useState(0),[review,setReview]=useState(false),[loading,setLoading]=useState(false);
 const [error,setError]=useState(''),[feedback,setFeedback]=useState('');
 const generation=useRef(0);
 const load=useCallback(async(before?:{beforeAt:string;beforeId:string})=>{
  const token=++generation.current;setLoading(true);setError('');
  try {
   const response=await command<Page>('count_workspace',{organizationId,branchId,...before});
   if(token!==generation.current)return;
   const page=countPage(response.rows);
   setRows(old=>before ? [...old,...page.rows.filter(r=>!old.some(o=>o.id===r.id))] : page.rows);
   setNext(page.next);setOpenCount(response.openCount);
  }catch(e){if(token===generation.current)setError(e instanceof Error ? e.message : 'Could not load counts. Reconnect and refresh.');}
  finally{if(token===generation.current)setLoading(false);}
 },[organizationId,branchId]);
 const invalidate=useCallback(()=>{generation.current++;},[]);
 useEffect(()=>{if(online)void load();return invalidate;},[load,online,revision,invalidate]);
 const blocked=disabled || !online || loading;
 async function save(action:string,body:Record<string,unknown>,idField?:string){
  await onlineOperation(db,actorId,action,{organizationId,branchId,...body},idField);
  setFeedback(action==='approve_count' ? 'Adjustment approved once. Original count evidence is retained.' : 'Count step saved. Completed entries cannot be edited.');
  await load();
 }
 return <><section className="panel blind-counts" aria-label="Blind stock counts">
  <div className="section-heading"><h2>Blind stock counts</h2><Button variant="outline" disabled={disabled || !online || loading} onClick={()=>void execute(async()=>{await load();})}>Refresh counts</Button></div>
  <p>Close and synchronize every branch shift first. Two different people enter sealed counts, then an owner who entered neither approves. Count saleable goods only; keep held goods and stock in transit separate.</p>
  <div className="button-row"><Button variant={review?'outline':'default'} aria-pressed={!review} onClick={()=>setReview(false)}>Enter blind counts</Button><Button variant={review?'default':'outline'} aria-pressed={review} onClick={()=>setReview(true)}>Review sealed counts</Button></div>
  <p className="muted">{openCount} open count{openCount===1?'':'s'}. {review ? 'Comparisons appear only after both entries are sealed.' : 'Expected stock and previous quantities are hidden in this entry view. Count from the physical goods.'}</p>
  {!online && <p role="status" className="notice">Counts and approvals require a connection. Saved evidence remains on the server.</p>}
  {feedback && <p role="status" className="notice success">{feedback}</p>}
  {error && <p role="alert" className="notice error">{error} Select Refresh counts to retry.</p>}
  {!review && <form aria-label="Start a blind count" className="count-start" onSubmit={e=>{
   e.preventDefault();const form=e.currentTarget,f=new FormData(form);const [productId,batchId]=field(f,'stock').split(':');
   void execute(async()=>{await save('start_blind_count',{productId,batchId:batchId==='none'?null:batchId,reason:field(f,'reason')},'countId');form.reset();});
  }}>
   <h3>Start a blind count</h3>
   <label className="field"><span>Product / batch</span><select name="stock" required disabled={blocked}>
    {products.flatMap(p=>p.batches.length ? p.batches.map(b=><option key={b.id} value={`${p.id}:${b.id}`}>{p.name} · {b.lot} ({p.baseUnit})</option>) : [<option key={p.id} value={`${p.id}:none`}>{p.name} ({p.baseUnit})</option>])}
   </select></label>
   <label className="field"><span>Counting scope / reason</span><input name="reason" required minLength={3} maxLength={1000} disabled={blocked} placeholder="For example, end-of-day loose feeds" /></label>
   <Button disabled={blocked || !products.length}>Start blind count</Button>
  </form>}
  {!loading && !rows.length && <p>No blind counts yet. Start after all sales are synchronized and shifts are closed.</p>}
  <div className="count-records" aria-busy={loading}>
   {rows.map(row=>{
    const first=row.state==='first_count' && row.startedBy===actorId;
    const recount=row.state==='recount' && row.startedBy!==actorId;
    const unit=products.find(p=>p.id===row.productId)?.baseUnit ?? 'base units';
    return <article className="count-record" key={row.id} aria-label={countLabel(row,products)}>
     <h3>{countLabel(row,products)}</h3><p className="count-context">{row.reason}</p>
     <small>Count {row.id.slice(0,8)} · {new Date(row.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</small>
     <p><strong>{countState[row.state]}</strong></p>
     {row.stale && <p className="notice error">Stock moved after this count started. Close this record and start a fresh count; it cannot adjust stock.</p>}
     {review && row.recounted!==null && <dl className="count-comparison">
      <div><dt>Expected</dt><dd>{new Decimal(row.expected!).toFixed()} {unit}</dd></div>
      <div><dt>First count</dt><dd>{new Decimal(row.counted!).toFixed()} {unit}</dd></div>
      <div><dt>Independent recount</dt><dd>{new Decimal(row.recounted).toFixed()} {unit}</dd></div>
      <div><dt>Difference from expected</dt><dd>{new Decimal(row.counted!).minus(row.expected!).toFixed()} {unit}</dd></div>
     </dl>}
     {review && row.recounted!==null && <><p>First count notes: {row.firstNotes}</p><p>Recount notes: {row.recountNotes}</p><small>First counter: {row.firstCounterName} · Recounted by: {row.recounterName}</small></>}
     {!review && !row.stale && (first || recount) && <form aria-label={first?'Seal first count':'Seal independent recount'} onSubmit={e=>{
      e.preventDefault();const form=e.currentTarget,f=new FormData(form);
      void execute(async()=>{await save('record_blind_count',{countId:row.id,stage:first?'first':'recount',quantity:field(f,'quantity'),notes:field(f,'notes')},'observationId');});
     }}>
      <p>{first?'Record your physical count without consulting expected stock.':'Count independently before asking the first counter for their result. Your entry is sealed before comparisons are revealed.'}</p>
      <label className="field"><span>{first?'First physical quantity':'Independent recount quantity'} ({unit})</span><input name="quantity" type="number" min="0" step={unit==='piece'?'1':'0.000001'} required disabled={blocked} /></label>
      <label className="field"><span>{first?'First count notes':'Independent recount notes'}</span><textarea name="notes" required minLength={3} maxLength={1000} disabled={blocked} /></label>
      <Button disabled={blocked}>{first?'Seal first count':'Seal independent recount'}</Button>
     </form>}
     {row.state==='recount' && row.startedBy===actorId && <p>Another signed-in person must recount. Your sealed first entry is retained.</p>}
     {review && canApproveCount(row,actorId,owner) && <ApprovalForm action="Approve adjustment" label="Approval evidence" description="Both signed-in counters agree. Verify their evidence before posting one linked stock adjustment. The discrepancy investigation remains open." confirmLabel="Confirm adjustment" disabled={blocked} onConfirm={reason=>execute(()=>save('approve_count',{countId:row.id,reason}))} />}
     {review && row.state==='ready' && owner && (row.firstCounter===actorId || row.recounter===actorId) && <p>An owner who entered neither count must approve. A typed witness name cannot replace their sign-in.</p>}
     {row.state==='disputed' && <p>No adjustment is allowed. Investigate the difference, close this record with an explanation, then start a fresh blind count. Both entries remain retained.</p>}
     {row.state==='cancelled' && <p>Closure reason: {row.cancelledReason}</p>}
     {row.state!=='approved' && row.state!=='cancelled' && (owner || row.startedBy===actorId) && <ApprovalForm action="Close without adjustment" label="Reason for closing this count" description="Keep the original evidence and close this count without changing stock. Start a fresh count if counting must continue." confirmLabel="Close count" disabled={blocked} onConfirm={reason=>execute(()=>save('cancel_blind_count',{countId:row.id,reason}))} />}
    </article>;
   })}
  </div>
  {loading && <p role="status">Loading count records…</p>}
  {next && <Button variant="outline" disabled={blocked} onClick={()=>void load(next)}>Load older counts</Button>}
 </section>{review && children}</>;
}
