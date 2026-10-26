import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import {retainedTables as tables,fingerprintSQL} from './recovery-fingerprints.mjs';
if (process.env.CI !== "true" || process.platform !== "linux")
  throw new Error(
    "This drill runs only on the disposable CI Supabase database.",
  );
const container = "supabase_db_agristore-pos",
  database = "agristore_restore_drill";
const local = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], {encoding:"utf8"}));
if(local.API_URL!=="http://127.0.0.1:55321") throw new Error("Restore fixtures require the configured loopback stack.");
const run = (args, input) =>
  execFileSync(
    "docker",
    ["exec", ...(input ? ["-i"] : []), container, ...args],
    {
      input,
      encoding: "utf8",
      stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    },
  );
const seed = `
insert into auth.users(id,email) values('55000000-0000-4000-8000-000000000001','restore@example.invalid');
insert into auth.sessions(id,user_id) values('55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000001');
insert into public.organizations(id,name) values('55000000-0000-4000-8000-000000000002','CI restore fixture');
insert into public.branches(id,organization_id,name,code) values('55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000002','Restore branch','RESTORE');
insert into public.staff_memberships(organization_id,user_id,role,name) values('55000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000001','owner','Restore owner');
insert into public.products(id,organization_id,name,sku,base_unit) values('55000000-0000-4000-8000-000000000004','55000000-0000-4000-8000-000000000002','Restore feeds','RESTORE-FEED','kg');
insert into public.inventory_movements(organization_id,branch_id,product_id,quantity,kind,source_id,created_by) values('55000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000004',14.5,'opening','55000000-0000-4000-8000-000000000005','55000000-0000-4000-8000-000000000001');
`;
const id = n => `55000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const sql = (input, target="postgres", user="postgres") => run(["psql","-U",user,"-d",target,"-v","ON_ERROR_STOP=1","-At"], input);
const lastJSON = output => JSON.parse(output.trim().split("\n").at(-1));
const login = (actor=1) => `set role authenticated; select set_config('request.jwt.claims','${JSON.stringify({sub:id(actor),session_id:id(actor),role:"authenticated"})}',false);`;
const ctx = (branch=3) => ({organizationId:id(2),branchId:id(branch)});
const command = (action,data,target="postgres",actor=1) => lastJSON(sql(login(actor)+`select public.agri_command('${action}','${JSON.stringify(data)}'::jsonb);`,target));
run(
  ["psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  seed,
);
sql(`insert into public.branches(id,organization_id,name,code) values('${id(6)}','${id(2)}','TEST restore destination','RESTORE2');
insert into public.product_units(id,organization_id,product_id,name,factor) values('${id(7)}','${id(2)}','${id(4)}','Kilo',1);
insert into public.unit_prices(organization_id,unit_id,version,price,cost) values('${id(2)}','${id(7)}',1,3200,2400);`);
command("register_device",{...ctx(),deviceId:id(8),name:"TEST restore PC"});
const shift = command("open_shift",{...ctx(),deviceId:id(8),openingCash:0});
const sale = {version:1,transactionId:id(9),...ctx(),deviceId:id(8),cashierId:id(1),shiftId:shift.shiftId,occurredAt:new Date().toISOString(),total:1600,cashReceived:2000,items:[{productId:id(4),unitId:id(7),batchId:null,name:"Restore feeds",unitName:"Kilo",quantity:"0.5",factor:"1",unitPrice:3200,unitCost:2400,priceVersion:1,lineTotal:1600}]};
assert.equal(command("record_sale",sale).status,"created");
const refund = {...ctx(),saleId:id(9),refundId:id(10),shiftId:shift.shiftId,reason:"TEST full cash refund, goods held",returns:[{lineIndex:0,quantity:"0.5",disposition:"hold"}]};
command("refund_sale",refund);
const issue = {...ctx(),issueId:id(11),productId:id(4),batchId:null,quantity:"1",category:"damage",disposition:"hold",reason:"TEST damaged sack segregated"};
command("record_stock_issue",issue);
command("approve_stock_issue",{...ctx(),issueId:id(11),reason:"TEST owner inspected damaged goods"});
command("dispatch_transfer",{...ctx(),transferId:id(12),productId:id(4),batchId:null,quantity:"3",destinationBranchId:id(6)});
const receipt = {...ctx(6),transferId:id(12),receiptId:id(13),quantity:"2",heldQuantity:"0.25",reason:"TEST partial delivery: 0.75 kg still in transit"};
command("receive_transfer",receipt);
const refundHold = sql(`select id from public.stock_holds where organization_id='${id(2)}' and source_id='${id(10)}';`).trim();
const release = {...ctx(),holdId:refundHold,dispositionId:id(14),quantity:"0.25",disposition:"release",reason:"TEST inspected quarter kilo is saleable"};
command("disposition_hold",release);
command("close_shift",{...ctx(),deviceId:id(8),shiftId:shift.shiftId,countedCash:0});
// Preserve a ready pair and a first-only blind observation through the actual dump/restore.
sql(`insert into auth.users(id,email) values('${id(16)}','restore-first@example.invalid'),('${id(17)}','restore-second@example.invalid');
insert into auth.sessions(id,user_id) values('${id(16)}','${id(16)}'),('${id(17)}','${id(17)}');
insert into public.staff_memberships(organization_id,user_id,branch_id,role,name) values('${id(2)}','${id(16)}','${id(3)}','stock_staff','TEST restored first counter'),('${id(2)}','${id(17)}','${id(3)}','stock_staff','TEST restored independent counter');`);
const countBody={...ctx(),countId:id(18),productId:id(4),batchId:null,reason:'TEST restore sealed counts'};
command('start_blind_count',countBody,'postgres',16);
const firstCount={...ctx(),countId:id(18),stage:'first',quantity:'10.25',notes:'TEST restored first observation',observationId:id(19)};
const recount={...ctx(),countId:id(18),stage:'recount',quantity:'10.25',notes:'TEST restored independent observation',observationId:id(20)};
command('record_blind_count',firstCount,'postgres',16);command('record_blind_count',recount,'postgres',17);
command('start_blind_count',{...countBody,countId:id(21)},'postgres',16);
command('record_blind_count',{...firstCount,countId:id(21),observationId:id(22)},'postgres',16);
const followupException=sql(`select id from public.stock_exceptions where organization_id='${id(2)}' and source_id='${id(11)}' and kind='stock_issue';`).trim();
const assignment={...ctx(),exceptionId:followupException,assigneeId:id(16),dueOn:'2026-10-01',expectedVersion:0,followUpId:id(24),reason:'TEST restore assigned investigation'};
const progress={...ctx(),exceptionId:followupException,expectedVersion:1,followUpId:id(25),reason:'TEST evidence retained while still unresolved'};
command('assign_stock_exception',assignment);command('note_stock_exception',progress,'postgres',16);
// Preserve documented cost and replay its original request after real pg_restore.
const damageHold=sql(`select id from public.stock_holds where organization_id='${id(2)}' and source_id='${id(11)}';`).trim();
const disposal={...ctx(),holdId:damageHold,dispositionId:id(30),quantity:'0.25',disposition:'dispose',reason:'TEST held goods confirmed unusable'};
command('disposition_hold',disposal);
const costEvidence={...ctx(),lossKey:'held:'+id(30),costEvidenceId:id(31),expectedCostId:null,unitId:id(7),unitCostCentavos:'2400',zeroCostConfirmed:false,reference:'TEST supplier invoice RESTORE-001',reason:'TEST documented cost per kilo'};
command('record_loss_cost',costEvidence);
sql(`insert into public.suppliers(id,organization_id,name) values('${id(40)}','${id(2)}','TEST restore supplier');`);
const purchaseOrder={...ctx(),purchaseOrderId:id(41),supplierId:id(40),reference:'TEST-RESTORE-PO',reason:'TEST two kilos ordered',items:[{lineId:id(42),productId:id(4),unitId:id(7),quantity:'2'}]};
const orderApproval={...ctx(),purchaseOrderId:id(41),orderEventId:id(43),expectedState:'pending',outcome:'approve',reason:'TEST owner approved restore order'};
const rejectedDelivery={...ctx(),purchaseOrderId:id(41),supplierId:id(40),receiptId:id(44),reference:'TEST-RESTORE-REJECTION',reason:'TEST all goods rejected before store custody',items:[{orderLineId:id(42),productId:id(4),unitId:id(7),documentQuantity:'2',accepted:'0',held:'0',rejected:'2',reason:'TEST supplier kept all damaged goods'}]};
const supplierProgress={...ctx(),receiptId:id(44),claimEventId:id(45),expectedVersion:0,outcome:'progress',reference:'TEST-CLAIM-RESTORE',reason:'TEST supplier acknowledged rejected delivery'};
const supplierResolution={...ctx(),receiptId:id(44),claimEventId:id(46),expectedVersion:1,outcome:'returned',reference:'TEST-RETURN-RESTORE',reason:'TEST owner checked supplier signed rejection'};
command('create_purchase_order',purchaseOrder);command('purchase_order_event',orderApproval);command('inspect_delivery',rejectedDelivery);command('record_delivery_claim',supplierProgress);command('record_delivery_claim',supplierResolution);
const reversedOrder={...ctx(6),purchaseOrderId:id(60),supplierId:id(40),reference:'TEST-RESTORE-REVERSED-PO',reason:'TEST untouched receipt correction',items:[{lineId:id(61),productId:id(4),unitId:id(7),quantity:'0.5'}]};
command('create_purchase_order',reversedOrder);command('purchase_order_event',{...ctx(6),purchaseOrderId:id(60),orderEventId:id(62),expectedState:'pending',outcome:'approve',reason:'TEST owner approved correction fixture'});
const mistakenReceipt={...ctx(6),purchaseOrderId:id(60),supplierId:id(40),receiptId:id(63),reference:'TEST-RESTORE-MISTAKEN',reason:'TEST mistaken quantity in saved delivery',items:[{orderLineId:id(61),productId:id(4),unitId:id(7),documentQuantity:'0.5',accepted:'0.5',held:'0',rejected:'0',reason:'TEST original quantity'}]};
command('inspect_delivery',mistakenReceipt);command('purchase_order_event',{...ctx(6),purchaseOrderId:id(60),orderEventId:id(64),expectedState:'approve',outcome:'close',reason:'TEST owner closed original commitment'});
const reversePlan=command('delivery_reversal_check',{...ctx(6),receiptId:id(63)});
const reversal={...ctx(6),receiptId:id(63),reversalId:id(65),expectedLedgerRevision:reversePlan.ledgerRevision,expectedOrderVersion:reversePlan.orderVersion,reference:'TEST signed restore correction',reason:'TEST owner physically verified mistaken receiving and synchronized PCs',physicalConfirmed:true,queuesConfirmed:true};
command('reverse_delivery',reversal);
const correctedReceipt={...mistakenReceipt,receiptId:id(66),reference:'TEST-RESTORE-CORRECTED',correctsInspectionId:id(63),expectedReversalId:id(65),reason:'TEST linked corrected actual goods',items:[{...mistakenReceipt.items[0],accepted:'0.25',held:'0.25',reason:'TEST actual quarter kilo saleable and quarter kilo held'}]};
command('inspect_delivery',correctedReceipt);
// Compare retained content, not just row counts or one projected balance.
const fingerprints = target => lastJSON(sql(fingerprintSQL(id(2)),target));
const original = fingerprints("postgres");
const before = command("snapshot",{...ctx(),transactionIds:[id(9)]});
assert.equal(before.stocks[0].quantity,"10.250000");
run([
  "pg_dump",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "--format=custom",
  "--file=/tmp/agristore-drill.dump",
]);
run(["createdb", "-U", "postgres", "--template=template0", database]);
try {
  // Keep the built-in public schema supplied by template0. Restore the complete
  // dump, including extension definitions, into this otherwise empty database.
  run([
    "pg_restore",
    "-U",
    "supabase_admin",
    "--dbname=" + database,
    "--no-owner",
    "--exit-on-error",
    "/tmp/agristore-drill.dump",
  ]);
  assert.deepEqual(fingerprints(database),original,"Every retained fixture row must survive dump/restore unchanged");
  const restored = command("snapshot",{...ctx(),transactionIds:[id(9)]},database);
  assert.deepEqual(restored.stocks,before.stocks);
  assert.deepEqual(restored.confirmedIds,[id(9)]);
  assert.equal(command("record_sale",sale,database).status,"duplicate");
  command("refund_sale",refund,database);
  assert.equal(command("receive_transfer",receipt,database).duplicate,true);
  command("disposition_hold",release,database);
  assert.equal(command('assign_stock_exception',assignment,database).duplicate,true);
  assert.equal(command('note_stock_exception',progress,database,16).duplicate,true);
  assert.equal(command('record_loss_cost',costEvidence,database).duplicate,true);
  for(const [action,payload] of [['create_purchase_order',purchaseOrder],['purchase_order_event',orderApproval],['inspect_delivery',rejectedDelivery],['record_delivery_claim',supplierProgress],['record_delivery_claim',supplierResolution]]) assert.equal(command(action,payload,database).duplicate,true);
  const purchasing=command('purchasing_workspace',ctx(),database);
  assert.equal(purchasing.orders[0].lines[0].remaining,'2');assert.equal(purchasing.deliveries[0].claim_state,'resolved');
  assert.equal(command('delivery_claim_history',{...ctx(),receiptId:id(44)},database).rows.length,2);
  assert.equal(Number(sql(`select count(*) from public.inventory_movements where source_id='${id(44)}';`,database).trim()),0);
  assert.equal(command('reverse_delivery',reversal,database).duplicate,true);
  assert.equal(command('inspect_delivery',correctedReceipt,database).duplicate,true);
  const correctedPurchasing=command('purchasing_workspace',ctx(6),database);
  assert.equal(correctedPurchasing.orders[0].state,'approve');assert.equal(correctedPurchasing.orders[0].lines[0].remaining,'0');
  assert.equal(correctedPurchasing.deliveries.find(d=>d.id===id(63)).reversal.reopenedOrder,true);
  assert.equal(correctedPurchasing.deliveries.find(d=>d.id===id(66)).correctsInspectionId,id(63));
  const lossReport=command('stock_loss_report',ctx(),database);
  assert.equal(lossReport.totals.documentedLossCentavos,'600');
  assert.equal(lossReport.rows[0].reference,costEvidence.reference);
  assert.equal(command('loss_cost_history',{...ctx(),lossKey:costEvidence.lossKey},database).rows[0].id,id(31));
  const restoredFollowup=command('stock_followups',ctx(),database).cases.find(r=>r.id===followupException);
  assert.equal(restoredFollowup.assigned_user_id,id(16));assert.equal(restoredFollowup.due_on,assignment.dueOn);
  assert.equal(restoredFollowup.progress_note,progress.reason);assert.equal(restoredFollowup.follow_up_version,2);
  // Idempotent retries and reads must not change immutable financial/stock rows.
  const retried = fingerprints(database);
  for (const table of tables.filter(t=>t!=="devices")) assert.deepEqual(retried[table],original[table],`Restored retry changed ${table}`);
  const controls = command("stock_controls",ctx(),database);
  assert.equal(controls.holds.reduce((sum,h)=>sum+Number(h.remaining),0),1);
  const destination = command("snapshot",{...ctx(6),transactionIds:[]},database);
  assert.equal(destination.stocks[0].quantity,"2.250000");
  assert.equal(sql(`select (quantity-received_quantity-held_quantity-lost_quantity)::text from public.stock_transfers where id='${id(12)}';`,database).trim(),"0.750000");
  command('record_blind_count',firstCount,database,16);command('record_blind_count',recount,database,17);
  const restoredCounts=command('count_workspace',ctx(),database);
  assert.equal(restoredCounts.rows.find(r=>r.id===id(18)).counted,'10.250000');
  assert.equal(restoredCounts.rows.find(r=>r.id===id(21)).counted,null);
  command('approve_count',{...ctx(),countId:id(18),reason:'TEST restored approval by separate owner'},database);
  command('record_blind_count',{...recount,countId:id(21),observationId:id(23)},database,17);
  command('approve_count',{...ctx(),countId:id(21),reason:'TEST continued first-only count after restoration'},database);
  // --no-owner restores this private table under supabase_admin. Test the
  // immutable trigger as its owner; postgres is correctly denied UPDATE here.
  assert.throws(()=>sql(`update app_private.count_observations set quantity=1 where id='${id(19)}';`,database,"supabase_admin"),/History is immutable/);
  // Resume a real workflow after recovery; data alone is not enough.
  command("disposition_hold",{...release,dispositionId:id(15),reason:"TEST post-restore inspection"},database);
  assert.equal(command("snapshot",{...ctx(),transactionIds:[]},database).stocks[0].quantity,"10.500000");
  command('inspect_delivery',{...rejectedDelivery,receiptId:id(47),reference:'TEST-RESTORE-REPLACEMENT',reason:'TEST working replacement receiving after restoration',items:[{...rejectedDelivery.items[0],documentQuantity:'1',accepted:'1',rejected:'0',reason:'TEST replacement physically accepted'}]},database);
  assert.equal(command('purchasing_workspace',ctx(),database).orders[0].lines[0].remaining,'1');
  assert.equal(command('snapshot',{...ctx(),transactionIds:[]},database).stocks[0].quantity,'11.500000');
  const correctedHold=sql(`select hold_id from app_private.delivery_inspection_lines where inspection_id='${id(66)}';`,database,'supabase_admin').trim();
  command('disposition_hold',{...ctx(6),holdId:correctedHold,dispositionId:id(67),quantity:'0.25',disposition:'release',reason:'TEST post-restore inspection of corrected goods'},database);
  assert.equal(command('snapshot',{...ctx(6),transactionIds:[]},database).stocks[0].quantity,'2.500000');
  assert.throws(()=>sql(`delete from app_private.delivery_reversals where id='${id(65)}';`,database,'supabase_admin'),/History is immutable/);
  assert.throws(()=>sql(`update app_private.delivery_inspection_lines set rejected=0 where inspection_id='${id(44)}';`,database,'supabase_admin'),/History is immutable/);
  assert.throws(()=>sql(`update public.sales set total=1 where id='${id(9)}';`,database),/History is immutable/);
  assert.equal(Number(sql(`select count(*) from public.branch_inventory i where i.organization_id='${id(2)}' and i.quantity<>(select sum(m.quantity) from public.inventory_movements m where m.organization_id=i.organization_id and m.branch_id=i.branch_id and m.product_id=i.product_id and m.batch_id is not distinct from i.batch_id);`,database).trim()),0);
  console.log(
    "Restore drill passed: 36 table content fingerprints, immutable delivery reversal and movement lineage, correctly reopened order and linked corrected receipt, safe original retries and post-restore corrected-hold release, rejected deliveries and supplier claims, replacement receiving, purchase-cost evidence, independent counts, original sale/payment/refund, zero duplicate effects and zero ledger/projection differences. Disposable CI dump only; production cloud backup not certified.",
  );
} finally {
  run(["dropdb", "-U", "postgres", database]);
}
