// Loopback-only component fixture. Uses actual migrations/role checks; identities and Auth are simulated.
import {createServer} from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {localPostgres} from './local-postgres.mjs';
if(process.env.AGRISTORE_LOCAL_COUNT_FIXTURE!=='1')throw new Error('Use the dedicated local count-test command. Never deploy this fixture.');
const root=process.cwd(),port=3217,db=await localPostgres();
const id=n=>`75000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await mkdir('test-results',{recursive:true});
await build({entryPoints:['tests/fixtures/count-workspace.tsx'],bundle:true,outfile:'test-results/count-component.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-count-transport',setup(builder){builder.onResolve({filter:/api$/},args=>path.resolve(args.resolveDir,args.path)+'.ts'===path.join(root,'apps/web/lib/api.ts')?{path:path.join(root,'tests/fixtures/count-api.ts')}:undefined);}}]});
const cssFolder=path.join(root,'apps/web/.next/static/css'),styles=(await readdir(cssFolder)).filter(f=>f.endsWith('.css'));
if(!styles.length)throw new Error('Build the app first so the fixture uses its actual compiled styles.');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local blind-count verification</title>${styles.map(s=>`<link rel="stylesheet" href="/_next/static/css/${s}">`).join('')}</head><body><div id="root"></div><script src="/count-component.js"></script></body></html>`;
async function reset(){
 await db.exec(`truncate public.organizations cascade;
  insert into auth.users(id,email) values('${id(11)}','test-owner@example.invalid'),('${id(12)}','test-first@example.invalid'),('${id(13)}','test-second@example.invalid') on conflict do nothing;
  insert into auth.sessions(id,user_id) select id,id from auth.users on conflict do nothing;
  insert into public.organizations(id,name) values('${id(1)}','TEST local count fixture');
  insert into public.branches(id,organization_id,name,code) values('${id(3)}','${id(1)}','TEST local branch','LOCAL');
  insert into public.staff_memberships(organization_id,user_id,branch_id,role,name) values('${id(1)}','${id(11)}',null,'owner','TEST approving owner'),('${id(1)}','${id(12)}','${id(3)}','stock_staff','TEST first counter'),('${id(1)}','${id(13)}','${id(3)}','stock_staff','TEST independent counter');
  insert into public.products(id,organization_id,name,sku,base_unit) values('${id(5)}','${id(1)}','TEST loose feeds','LOCAL-FEEDS','kg');
  insert into public.product_batches(id,organization_id,product_id,lot) values('${id(7)}','${id(1)}','${id(5)}','TEST lot absent from downloaded catalog');
  insert into public.inventory_movements(organization_id,branch_id,product_id,quantity,kind,source_id,created_by) values('${id(1)}','${id(3)}','${id(5)}',10.5,'opening','${id(6)}','${id(11)}');`);
}
await reset();
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
 try{
  if(pathname==='/__test/reset' && req.method==='POST'){await reset();res.end('reset');return;}
  if(pathname==='/__test/command' && req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)throw new Error('Fixture request too large');}
   const {action,data}=JSON.parse(body),actors={owner:11,first:12,second:13},actor=actors[req.headers['x-count-test-actor']];
   if(!actor)throw new Error('Fixture identity missing');
   const result=await db.transaction(async tx=>{
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id(actor),session_id:id(actor),role:'authenticated'})]);
    return (await tx.query('select public.agri_command($1,$2::jsonb) as result',[action,JSON.stringify(data)])).rows[0].result;
   });
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(pathname==='/count-component.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('test-results/count-component.js'));return;}
  if(pathname.startsWith('/_next/static/')){
   const folder=path.join(root,'apps/web/.next/static'),file=path.resolve(folder,pathname.slice('/_next/static/'.length));
   if(!file.startsWith(folder+path.sep))throw new Error('Invalid fixture file');
   res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(await readFile(file));return;
  }
  if(['/','/owner/','/first/','/second/'].includes(pathname)){res.setHeader('Content-Type','text/html');res.end(html);return;}
  res.statusCode=404;res.end('Not found');
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:e.message,code:e.code ?? 'P0001'}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local component fixture: http://127.0.0.1:${port} (simulated Auth; ephemeral data)`));
async function close(){server.close();await db.close();process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
