import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PosDatabase} from '@agristore/offline';
import type {Product} from '@agristore/domain';
import {BlindCounts} from '../../apps/web/components/blind-counts';
import {pendingOperations,retryOperation,type PendingOperation} from '../../apps/web/lib/operations';
const id=(n:number)=>`75000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=location.pathname.split('/')[1],actorId=id(actor==='owner'?11:actor==='first'?12:13);
const db=new PosDatabase(`TEST-local-blind-count-${actor}`);
const products:Product[]=[{id:id(5),name:'TEST loose feeds',sku:'TEST-LOCAL-FEED',category:'Feeds',baseUnit:'kg',minimumStock:'0',tracksExpiry:false,active:true,batches:[],units:[]}];
function Fixture(){
 const [busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[error,setError]=useState(''),[pending,setPending]=useState<PendingOperation[]>([]);
 async function execute(fn:()=>Promise<void>){
  if(busy)return new Error('Test action already running');setBusy(true);setError('');
  try{await fn();setRevision(r=>r+1);}
  catch(e){const failure=e instanceof Error?e:new Error(String(e));setError(failure.message);return failure;}
  finally{setPending(await pendingOperations(db));setBusy(false);}
 }
 return <main className="main-content"><h1>Stock counts</h1><p>Local verification · simulated sign-ins · TEST goods only. Current person: {actor}.</p>
  {error && <p className="notice error" role="alert">{error}</p>}
  {pending.map(op=><button className="button button-outline" key={op.key} disabled={busy} onClick={()=>void execute(async()=>{await retryOperation(db,actorId,op);})}>Retry original request</button>)}
  <BlindCounts db={db} organizationId={id(1)} branchId={id(3)} actorId={actorId} products={products} owner={actor==='owner'} online disabled={busy} revision={revision} execute={execute} />
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
