import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync } from "node:fs";
import assert from "node:assert/strict";
const exec = promisify(execFile);
if (process.env.CI !== "true" || process.platform !== "linux")
  throw new Error("Capacity fixtures require the disposable Linux CI stack.");
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
if (status.API_URL !== "http://127.0.0.1:55321")
  throw new Error("Capacity fixtures must use the configured loopback stack.");
const args = ["exec", "-i", "supabase_db_agristore-pos", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"];
const sql = (input, stream = false) => execFileSync("docker", args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...(stream ? {stdio:["pipe","inherit","inherit"]} : {}) });
const id = n => `71000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const branches = [101, 102, 103, 104, 105];
const owner = id(11), org = id(1), feed = id(301), seed = id(303), kilo = id(403), packet = id(404);
const login = `set role authenticated; select set_config('request.jwt.claims','${JSON.stringify({ sub: owner, session_id: owner, role: "authenticated" })}',false);`;
const ctx = b => ({ organizationId: org, branchId: id(b) });
const command = (action, data) => `select public.agri_command('${action}','${JSON.stringify(data)}'::jsonb);`;
const lastJSON = output => JSON.parse(output.trim().split("\n").at(-1));
const footprint = () => lastJSON(sql(`select jsonb_build_object('databaseBytes',pg_database_size(current_database()),'relations',coalesce(jsonb_agg(r order by (r->>'totalBytes')::bigint desc),'[]')) from (select jsonb_build_object('table',relname,'dataBytes',pg_table_size(relid),'indexBytes',pg_indexes_size(relid),'totalBytes',pg_total_relation_size(relid)) r from pg_catalog.pg_statio_user_tables where schemaname='public') sizes;`));
const baselineSize = footprint();
const started = performance.now();
// Historical capacity fixtures exercise real foreign keys, indexes, immutable
// history and movement projections. They do not replay historical checkouts or
// simulate a year of elapsed hardware use. Every trigger remains enabled.
sql(`begin;
insert into auth.users(id,email) values('${owner}','capacity-owner@example.invalid');
insert into auth.sessions(id,user_id) values('${owner}','${owner}');
insert into public.organizations(id,name) values('${org}','TEST five-branch capacity');
insert into public.staff_memberships(organization_id,user_id,role,name) values('${org}','${owner}','owner','TEST capacity owner');
${branches.map((b,i) => `insert into public.branches(id,organization_id,name,code) values('${id(b)}','${org}','TEST capacity ${i+1}','C${i+1}');
insert into public.devices(id,organization_id,branch_id,name,registered_by) values('${id(501+i)}','${org}','${id(b)}','TEST capacity PC','${owner}');
insert into public.cashier_shifts(id,organization_id,branch_id,device_id,cashier_id,opened_at,closed_at,opening_cash,counted_cash,expected_cash)
 select ('71000000-0000-4000-8000-'||lpad((601+${i}+d*5)::text,12,'0'))::uuid,'${org}','${id(b)}','${id(501+i)}','${owner}',now()-interval '365 days'+d*interval '1 day',now()-interval '365 days'+d*interval '1 day'+interval '8 hours',0,840000,840000 from generate_series(0,364) d;`).join("\n")}
insert into public.products(id,organization_id,name,sku,base_unit) values('${feed}','${org}','TEST loose feeds','CAP-FEED','kg'),('${seed}','${org}','TEST seed packets','CAP-SEED','piece');
insert into public.product_units(id,organization_id,product_id,name,factor) values('${kilo}','${org}','${feed}','Kilo',1),('${packet}','${org}','${seed}','Packet',1);
insert into public.unit_prices(organization_id,unit_id,version,price,cost) values('${org}','${kilo}',1,3200,2400),('${org}','${packet}',1,2000,1000);
insert into public.inventory_movements(organization_id,branch_id,product_id,quantity,kind,source_id,created_by)
 select '${org}',b.id,p.id,case when p.id='${feed}' then 1000000 else 120000 end,'opening',gen_random_uuid(),'${owner}' from public.branches b cross join public.products p where b.organization_id='${org}' and p.organization_id='${org}';
create temporary table capacity_sales as
 select ('72000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid id,n,
 ('71000000-0000-4000-8000-'||lpad((101+(n-1)%5)::text,12,'0'))::uuid branch,
 ('71000000-0000-4000-8000-'||lpad((501+(n-1)%5)::text,12,'0'))::uuid device,
 ('71000000-0000-4000-8000-'||lpad((601+(n-1)%5+((n-1)/1500)*5)::text,12,'0'))::uuid shift,
 now()-interval '365 days'+((n-1)/1500)*interval '1 day'+((n-1)/5%300)*interval '96 seconds' occurred
 from generate_series(1,547500) n;
insert into public.sales(id,organization_id,branch_id,device_id,cashier_id,shift_id,occurred_at,received_at,total,cash_received,receipt,payload)
 select id,'${org}',branch,device,'${owner}',shift,occurred,occurred,2800,3000,'TEST-CAP-'||n,
 jsonb_build_object('version',1,'transactionId',id,'organizationId','${org}','branchId',branch,'deviceId',device,'cashierId','${owner}','shiftId',shift,'occurredAt',occurred,'total',2800,'cashReceived',3000,'items',jsonb_build_array(
 jsonb_build_object('productId','${feed}','unitId','${kilo}','batchId',null,'name','TEST loose feeds','unitName','Kilo','quantity','0.25','factor','1','unitPrice',3200,'unitCost',2400,'priceVersion',1,'lineTotal',800),
 jsonb_build_object('productId','${seed}','unitId','${packet}','batchId',null,'name','TEST seed packets','unitName','Packet','quantity','1','factor','1','unitPrice',2000,'unitCost',1000,'priceVersion',1,'lineTotal',2000))) from capacity_sales;
insert into public.sale_items(organization_id,sale_id,product_id,unit_id,quantity,factor,price,cost,line_total,price_version)
 select '${org}',c.id,p.product,p.unit,p.quantity,1,p.price,p.cost,p.total,1 from capacity_sales c cross join (values('${feed}'::uuid,'${kilo}'::uuid,0.25,3200,2400,800),('${seed}'::uuid,'${packet}'::uuid,1,2000,1000,2000)) p(product,unit,quantity,price,cost,total);
insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount,created_at) select '${org}',branch,id,shift,2800,occurred from capacity_sales;
commit;
${Array.from({length:110},(_,i)=>`begin;
insert into public.inventory_movements(organization_id,branch_id,product_id,quantity,kind,source_id,created_by,created_at) select '${org}',branch,p.product,-p.quantity,'sale',c.id,'${owner}',occurred from capacity_sales c cross join (values('${feed}'::uuid,0.25),('${seed}'::uuid,1)) p(product,quantity) where c.n>${i*5000} and c.n<=${(i+1)*5000};
commit;`).join("\n")}
begin;
insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details,created_at) select '${org}',branch,'${owner}','record_sale',id,'{"flags":[]}',occurred from capacity_sales;
commit;
analyze public.sales; analyze public.sale_items; analyze public.payments; analyze public.inventory_movements; analyze public.audit_events;`,true);
const seedSeconds = (performance.now() - started) / 1000;
assert.equal(Number(sql(`select count(*) from public.sales where organization_id='${org}';`).trim()), 547500);
const consistency = sql(`select count(*) from public.branch_inventory i where i.organization_id='${org}' and i.quantity<>(select sum(m.quantity) from public.inventory_movements m where m.organization_id=i.organization_id and m.branch_id=i.branch_id and m.product_id=i.product_id and m.batch_id is not distinct from i.batch_id);`);
assert.equal(Number(consistency.trim()), 0, "Every projection must match the retained ledger");
const queryStart = performance.now();
const snapshot = lastJSON(sql(login + command("snapshot", { ...ctx(101), transactionIds: Array.from({ length: 1000 }, (_, i) => `72000000-0000-4000-8000-${String(i*5+1).padStart(12,"0")}`) })));
assert.equal(snapshot.confirmedIds.length, 1000);
sql(login + command("dashboard", ctx(101)));
const querySeconds = (performance.now() - queryStart) / 1000;
assert.ok(querySeconds < 15, `Snapshot and dashboard exceeded the app request window: ${querySeconds}s`);
const shifts = branches.map((b,i) => lastJSON(sql(login + command("open_shift", { ...ctx(b), deviceId: id(501+i), openingCash: 0 }))));
for (const s of shifts) assert.ok(s.shiftId, "Shift response must contain a shift ID");
const sale = (n,index) => ({ version: 1, transactionId: id(n), ...ctx(branches[index]), deviceId: id(501+index), cashierId: owner, shiftId: shifts[index].shiftId, occurredAt: new Date().toISOString(), total: 800, cashReceived: 1000, items: [{ productId: feed, unitId: kilo, batchId: null, name: "TEST loose feeds", unitName: "Kilo", quantity: "0.25", factor: "1", unitPrice: 3200, unitCost: 2400, priceVersion: 1, lineTotal: 800 }] });
const parallel = Array.from({ length: 5 }, (_, i) => sale(9000+i,i));
await Promise.all(parallel.map(async payload => {
  const result = await exec("docker", [...args, "-c", login + command("record_sale", payload)], { maxBuffer: 1024*1024 });
  assert.equal(lastJSON(result.stdout).status, "created");
}));
for (const payload of parallel) assert.equal(lastJSON(sql(login + command("record_sale", payload))).status, "duplicate");
const backlog = Array.from({ length: 1000 }, (_, i) => sale(10000+i,i%5));
const uploadStart = performance.now();
sql(login + backlog.map(payload => command("record_sale", payload)).join("\n"));
const uploadSeconds = (performance.now() - uploadStart) / 1000;
// Pretend the first upload acknowledgments never reached the cashier. Replay
// the exact immutable payloads, including occurredAt, rather than new sales.
const replayStart = performance.now();
const replay = sql(login + backlog.map(payload => command("record_sale", payload)).join("\n"));
const replayJSON = replay.trim().split("\n").filter(line => line.startsWith('{')).map(line => JSON.parse(line));
// set_config echoes the test's JWT claims before the sale acknowledgments.
assert.deepEqual(replayJSON[0],{sub:owner,session_id:owner,role:"authenticated"});
const replayAcks = replayJSON.slice(1);
assert.equal(replayAcks.length, 1000);
assert.ok(replayAcks.every(ack => ack.status === "duplicate"));
const replaySeconds = (performance.now() - replayStart) / 1000;
// Twenty simultaneous attempts compete for the same branch/stock/shift. Each
// of ten different purchases is submitted twice, as racing retrying clients.
const burst = Array.from({ length: 10 }, (_, i) => sale(12000+i,0));
const burstStart = performance.now();
const burstAcks = await Promise.all(burst.flatMap(payload => [payload,payload]).map(async payload => {
  const result = await exec("docker", [...args, "-c", login + command("record_sale", payload)], { maxBuffer: 1024*1024 });
  return lastJSON(result.stdout);
}));
for (const payload of burst) assert.deepEqual(burstAcks.filter(a=>a.transactionId===payload.transactionId).map(a=>a.status).sort(),["created","duplicate"]);
const burstSeconds = (performance.now() - burstStart) / 1000;
assert.ok(burstSeconds < 15, `Same-stock burst exceeded the app request window: ${burstSeconds}s`);
assert.equal(lastJSON(sql(login + command("record_sale", {...burst[0],cashReceived:2000}))).status,"review");
assert.equal(Number(sql(`select count(*) from public.sales where organization_id='${org}';`).trim()), 548515);
assert.equal(Number(sql(`select count(*) from public.inventory_movements where organization_id='${org}' and kind='sale';`).trim()), 1096015);
assert.equal(Number(sql(`select count(*) from public.payments where organization_id='${org}';`).trim()), 548515);
assert.equal(Number(sql(`select count(*) from public.branch_inventory i where i.organization_id='${org}' and i.quantity<>(select sum(m.quantity) from public.inventory_movements m where m.organization_id=i.organization_id and m.branch_id=i.branch_id and m.product_id=i.product_id and m.batch_id is not distinct from i.batch_id);`).trim()),0);
// Exercise the app's first/next receipt page shape under authenticated RLS at
// annual volume. This is SQL timing; it excludes HTTP and browser rendering.
const pageStart = performance.now();
const history = cursor => lastJSON(sql(login + `select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('sale_reversals',coalesce((select jsonb_agg(jsonb_build_object('id',r.id)) from public.sale_reversals r where r.sale_id=s.id),'[]'::jsonb))),'[]'::jsonb) from (select * from public.sales where organization_id='${org}' and branch_id='${id(101)}' ${cursor ? `and (occurred_at,id)<('${cursor.occurred_at}'::timestamptz,'${cursor.id}'::uuid)` : ""} order by occurred_at desc,id desc limit 51) s;`));
const first = history(); const next = history(first[49]);
assert.equal(first.length,51); assert.equal(next.length,51);
assert.equal(new Set([...first.slice(0,50),...next.slice(0,50)].map(s=>s.id)).size,100);
assert.ok([...first,...next].every(s=>s.branch_id===id(101)));
const pageSeconds = (performance.now() - pageStart) / 1000;
assert.ok(pageSeconds<15,`Receipt pages exceeded the app request window: ${pageSeconds}s`);
const finalSize = footprint();
const relationBytes = size => size.relations.reduce((sum,r)=>sum+r.totalBytes,0);
const publicGrowth = relationBytes(finalSize)-relationBytes(baselineSize);
assert.ok(publicGrowth>0);
const measurements = {baselineSize,finalSize,publicGrowth,publicBytesPerSale:publicGrowth/548515,snapshotJSONBytes:Buffer.byteLength(JSON.stringify(snapshot)),receiptPageJSONBytes:Buffer.byteLength(JSON.stringify(first)),seedSeconds,querySeconds,uploadSeconds,replaySeconds,burstSeconds,pageSeconds};
console.log("CAPACITY_MEASUREMENTS "+JSON.stringify(measurements));
const summary = `Capacity passed: 547,500 historical sales, 1,095,000 historical item/movement rows, five concurrent new sales, 1,000 queued uploads replayed without duplicates, and 20 racing same-stock attempts for ten separate purchases. Final 548,515 sales / payments and 1,096,015 sale movements; zero projection differences. Seed ${seedSeconds.toFixed(1)}s; snapshot + dashboard ${querySeconds.toFixed(2)}s; uploads ${uploadSeconds.toFixed(1)}s; replay ${replaySeconds.toFixed(1)}s; burst ${burstSeconds.toFixed(2)}s; two receipt pages ${pageSeconds.toFixed(2)}s. Public-table/index growth ${(publicGrowth/1024/1024).toFixed(1)} MiB (${(publicGrowth/548515).toFixed(0)} bytes/sale); database ${(finalSize.databaseBytes/1024/1024).toFixed(1)} MiB. Database sizes exclude WAL, backups, network, and browser storage. Synthetic Linux CI evidence; Windows hardware and real-time outage gates remain unpassed.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n\n```json\n"+JSON.stringify(measurements,null,2)+"\n```\n");
