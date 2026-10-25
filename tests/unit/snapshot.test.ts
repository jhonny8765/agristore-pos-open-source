import "fake-indexeddb/auto";
import {afterEach,expect,it,vi} from "vitest";
import {applySnapshot,clearAccountCache,saveCheckout,setSetting,setting,type PosDatabase} from "@agristore/offline";
import {requestSnapshot,supabase} from "../../apps/web/lib/api";
import {product,sale,setupDB,uuid} from "./fixtures";
const databases: PosDatabase[]=[];
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const db of databases.splice(0)){db.close();await db.delete();}});
async function local(){const db=await setupDB();databases.push(db);vi.stubGlobal('navigator',{onLine:true});return db;}

it('batches acknowledgment IDs and combines the newest stock with an earlier full catalog',async()=>{
  const db=await local();await setSetting(db,'catalogVersion','1');
  const ids=Array.from({length:1001},(_,n)=>uuid(100+n));
  const next={...product,name:'Updated feeds'};
  const rpc=vi.spyOn(supabase,'rpc').mockResolvedValueOnce({data:{asOf:'2026-10-25T01:00:00Z',products:[next],stocks:[{key:`${product.id}:none`,productId:product.id,batchId:null,quantity:'499'}],confirmedIds:ids.slice(0,1000),catalogVersion:'2',catalogUnchanged:false},error:null,count:null,status:200,statusText:'OK'} as never)
    .mockResolvedValueOnce({data:{asOf:'2026-10-25T01:00:01Z',products:[],stocks:[{key:`${product.id}:none`,productId:product.id,batchId:null,quantity:'498'}],confirmedIds:ids.slice(1000),catalogVersion:'2',catalogUnchanged:true},error:null,count:null,status:200,statusText:'OK'} as never);
  const result=await requestSnapshot(db,{organizationId:uuid(1),branchId:uuid(2),transactionIds:ids});
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls[0][1]).toMatchObject({data:{catalogVersion:'1',transactionIds:ids.slice(0,1000)}});
  expect(rpc.mock.calls[1][1]).toMatchObject({data:{catalogVersion:'2',transactionIds:ids.slice(1000)}});
  expect(result.confirmedIds).toEqual(ids);expect(result.products).toEqual([next]);expect(result.catalogUnchanged).toBe(false);
  await applySnapshot(db,result);
  expect((await db.stocks.get(`${product.id}:none`))?.quantity).toBe('498');
  expect((await db.products.get(product.id))?.name).toBe('Updated feeds');
});

it('retains cached products on an unchanged catalog and removes its version on account cache reset',async()=>{
  const db=await local();await setSetting(db,'catalogVersion','1');
  vi.spyOn(supabase,'rpc').mockResolvedValue({data:{asOf:'2026-10-25T01:00:00Z',products:[],stocks:[],confirmedIds:[],catalogVersion:'1',catalogUnchanged:true},error:null,count:null,status:200,statusText:'OK'} as never);
  await applySnapshot(db,await requestSnapshot(db,{}));
  expect(await db.products.get(product.id)).toEqual(product);
  await clearAccountCache(db);expect(await setting(db,'catalogVersion')).toBeUndefined();
});

it('refuses a partial multi-request snapshot without replacing the saved catalog or stock',async()=>{
  const db=await local();
  const rpc=vi.spyOn(supabase,'rpc').mockResolvedValueOnce({data:{asOf:'2026-10-25T01:00:00Z',products:[],stocks:[],confirmedIds:[],catalogVersion:'2',catalogUnchanged:false},error:null,count:null,status:200,statusText:'OK'} as never)
    .mockResolvedValueOnce({data:null,error:{message:'TEST response interrupted'},count:null,status:503,statusText:'Unavailable'} as never);
  await expect(requestSnapshot(db,{transactionIds:Array.from({length:1001},(_,n)=>uuid(100+n))})).rejects.toThrow('response interrupted');
  expect(rpc).toHaveBeenCalledTimes(2);expect(await db.products.get(product.id)).toEqual(product);
  expect((await db.stocks.get(`${product.id}:none`))?.quantity).toBe('500');
  expect(await setting(db,'catalogVersion')).toBeUndefined();
});

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
function response(quantity:string,name:string,confirmedIds:string[]=[]){return{data:{asOf:'2026-10-25T01:00:00Z',products:[{...product,name}],stocks:[{key:`${product.id}:none`,productId:product.id,batchId:null,quantity}],confirmedIds,catalogVersion:'2',catalogUnchanged:false},error:null,count:null,status:200,statusText:'OK'};}

it('rejects an older response after a newer snapshot already confirmed the sales',async()=>{
 const db=await local(),one=sale(),two=sale();await saveCheckout(db,one);await saveCheckout(db,two);
 const started=deferred<void>(),old=deferred<ReturnType<typeof response>>();
 vi.spyOn(supabase,'rpc').mockImplementationOnce(()=>{started.resolve();return old.promise as never;}).mockResolvedValueOnce(response('498','Latest feeds',[one.transactionId,two.transactionId]) as never);
 const first=requestSnapshot(db,{organizationId:uuid(1),branchId:uuid(2)});await started.promise;
 const newest=await requestSnapshot(db,{organizationId:uuid(1),branchId:uuid(2)});await applySnapshot(db,newest);
 old.resolve(response('499','Old feeds',[one.transactionId]));
 await expect(applySnapshot(db,await first)).rejects.toThrow('replaced this request');
 expect((await db.stocks.get(`${product.id}:none`))?.quantity).toBe('498');
 expect((await db.products.get(product.id))?.name).toBe('Latest feeds');
 expect((await db.sales.toArray()).every(s=>s.status==='synced')).toBe(true);
});
it('does not restore a signed-out account from an outstanding stock request',async()=>{
 const db=await local(),pending=sale();await saveCheckout(db,pending);
 const started=deferred<void>(),late=deferred<ReturnType<typeof response>>();
 vi.spyOn(supabase,'rpc').mockImplementationOnce(()=>{started.resolve();return late.promise as never;});
 const request=requestSnapshot(db,{organizationId:uuid(1),branchId:uuid(2)});await started.promise;
 await clearAccountCache(db);late.resolve(response('499','Signed-out private catalog',[pending.transactionId]));
 await expect(applySnapshot(db,await request)).rejects.toThrow('replaced this request');
 expect(await db.products.count()).toBe(0);expect(await db.stocks.count()).toBe(0);
 expect((await db.sales.get(pending.transactionId))?.status).toBe('pending');
});
it('retains the last confirmed stock when a newer request fails and the older response arrives late',async()=>{
 const db=await local(),started=deferred<void>(),late=deferred<ReturnType<typeof response>>();
 vi.spyOn(supabase,'rpc').mockImplementationOnce(()=>{started.resolve();return late.promise as never;}).mockResolvedValueOnce({data:null,error:{message:'TEST latest network failure'},count:null,status:503,statusText:'Unavailable'} as never).mockResolvedValueOnce(response('497','Fresh feeds') as never);
 const old=requestSnapshot(db,{});await started.promise;
 await expect(requestSnapshot(db,{})).rejects.toThrow('latest network failure');
 late.resolve(response('499','Out-of-date feeds'));
 await expect(applySnapshot(db,await old)).rejects.toThrow('replaced this request');
 expect((await db.stocks.get(`${product.id}:none`))?.quantity).toBe('500');
 await applySnapshot(db,await requestSnapshot(db,{}));
 expect((await db.stocks.get(`${product.id}:none`))?.quantity).toBe('497');
});
