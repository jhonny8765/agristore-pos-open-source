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
// Isolate partial-refund cash/stock evidence from the earlier count and transfer fixtures.
sql(`insert into public.branches(id,organization_id,name,code) values('${id(70)}','${id(2)}','TEST restore refund branch','RESTORE3');`);
command('register_device',{...ctx(70),deviceId:id(71),name:'TEST restore refund drawer'});
const partialShift=command('open_shift',{...ctx(70),deviceId:id(71),openingCash:10000});
command('receive_stock',{...ctx(70),receiptId:id(73),source:'purchase',reference:'TEST refund restore stock',items:[{productId:id(4),unitId:id(7),quantity:'5'}]});
const partialSale={...sale,...ctx(70),transactionId:id(72),deviceId:id(71),shiftId:partialShift.shiftId,total:3200,cashReceived:5000,items:[{...sale.items[0],quantity:'1',lineTotal:3200}]};
command('record_sale',partialSale);
const partialRequest={...ctx(70),saleId:id(72),refundId:id(74),shiftId:partialShift.shiftId,expectedRefundVersion:0,expectedAmount:1600,reference:'TEST saved partial refund',reason:'TEST half kilo refunded with quarter kilo saleable and quarter held',physicalConfirmed:true,items:[{lineIndex:0,quantity:'0.5',returnedQuantity:'0.5',disposition:'mixed',resalableQuantity:'0.25'}]};
command('partial_refund_sale',partialRequest);
command('close_shift',{...ctx(70),deviceId:id(71),shiftId:partialShift.shiftId,countedCash:11600});
// Keep a mistaken refund, immutable undo and linked replacement through real pg_restore.
sql(`insert into public.branches(id,organization_id,name,code) values('${id(80)}','${id(2)}','TEST restored corrected refund','RESTORE4');`);
command('register_device',{...ctx(80),deviceId:id(81),name:'TEST correction restore drawer'});
const correctionShift=command('open_shift',{...ctx(80),deviceId:id(81),openingCash:10000});
command('receive_stock',{...ctx(80),receiptId:id(82),source:'purchase',reference:'TEST correction restore goods',items:[{productId:id(4),unitId:id(7),quantity:'5'}]});
const correctionSale={...sale,...ctx(80),transactionId:id(83),deviceId:id(81),shiftId:correctionShift.shiftId,total:3200,cashReceived:5000,items:[{...sale.items[0],quantity:'1',lineTotal:3200}]};command('record_sale',correctionSale);
const mistakenRefund={...partialRequest,...ctx(80),saleId:id(83),refundId:id(84),shiftId:correctionShift.shiftId};command('partial_refund_sale',mistakenRefund);
const correctionCheck=command('refund_correction_check',{...ctx(80),saleId:id(83),refundId:id(84),refundKind:'partial',shiftId:correctionShift.shiftId});
assert.equal(correctionCheck.eligible,true);
const refundCorrection={...ctx(80),saleId:id(83),refundId:id(84),refundKind:'partial',shiftId:correctionShift.shiftId,correctionId:id(85),expectedLedgerRevision:correctionCheck.ledgerRevision,expectedRefundVersion:correctionCheck.refundVersion,cashRestoredCentavos:1600,reference:'TEST retained recovered refund cash',reason:'TEST mistaken physical quantities and full cash recovery verified',cashConfirmed:true,goodsConfirmed:true,queuesConfirmed:true};command('correct_refund',refundCorrection);
const replacementRefund={...mistakenRefund,refundId:id(86),expectedRefundVersion:2,expectedAmount:800,correctsCorrectionId:id(85),reference:'TEST linked replacement refund',items:[{lineIndex:0,quantity:'0.25',returnedQuantity:'0.125',disposition:'resalable'}]};command('partial_refund_sale',replacementRefund);
command('close_shift',{...ctx(80),deviceId:id(81),shiftId:correctionShift.shiftId,countedCash:12400});
// Meter / liter purchasing and pending transfer/count evidence survives the same full restore.
sql(`insert into public.branches(id,organization_id,name,code) values('${id(90)}','${id(2)}','TEST measured source','RESTORE5'),('${id(91)}','${id(2)}','TEST measured destination','RESTORE6');
insert into public.staff_memberships(organization_id,user_id,branch_id,role,name) values('${id(2)}','${id(16)}','${id(91)}','stock_staff','TEST measured first counter'),('${id(2)}','${id(17)}','${id(91)}','stock_staff','TEST measured recounter');
insert into public.products(id,organization_id,name,sku,base_unit) values('${id(94)}','${id(2)}','TEST restored rope','RESTORE-METER','meter'),('${id(95)}','${id(2)}','TEST restored liquid','RESTORE-LITER','liter');
insert into public.product_units(id,organization_id,product_id,name,factor) values('${id(96)}','${id(2)}','${id(94)}','100 meter roll',100),('${id(97)}','${id(2)}','${id(95)}','500 ml container',0.5);
insert into public.unit_prices(organization_id,unit_id,version,price,cost) values('${id(2)}','${id(96)}',1,150000,100000),('${id(2)}','${id(97)}',1,4500,2500);`);
const measuredOrder={...ctx(90),purchaseOrderId:id(100),supplierId:id(40),reference:'TEST measured restore order',reason:'TEST documented meter and container conversion',items:[{lineId:id(101),productId:id(94),unitId:id(96),quantity:'2'},{lineId:id(102),productId:id(95),unitId:id(97),quantity:'6'}]};
const measuredApproval={...ctx(90),purchaseOrderId:id(100),orderEventId:id(103),expectedState:'pending',outcome:'approve',reason:'TEST owner checked real pack sizes'};
const measuredInspection={...ctx(90),purchaseOrderId:id(100),supplierId:id(40),receiptId:id(104),reference:'TEST measured restore inspection',reason:'TEST physical saleable, held and rejected goods',items:[{orderLineId:id(101),productId:id(94),unitId:id(96),documentQuantity:'1.25',accepted:'1',held:'0.125',rejected:'0.125',reason:'TEST actual rope lengths'},{orderLineId:id(102),productId:id(95),unitId:id(97),documentQuantity:'6',accepted:'4',held:'1',rejected:'1',reason:'TEST actual liquid measurements'}]};
for(const [action,body] of [['create_purchase_order',measuredOrder],['purchase_order_event',measuredApproval],['inspect_delivery',measuredInspection]])command(action,body);
const measuredDispatches=[{...ctx(90),transferId:id(105),productId:id(94),batchId:null,quantity:'12.75',destinationBranchId:id(91)},{...ctx(90),transferId:id(106),productId:id(95),batchId:null,quantity:'0.375',destinationBranchId:id(91)}];
const measuredReceipts=[{...ctx(91),transferId:id(105),receiptId:id(107),quantity:'12.25',heldQuantity:'0.25',reason:'TEST quarter meter remains in transit'},{...ctx(91),transferId:id(106),receiptId:id(108),quantity:'0.25',heldQuantity:'0.1',reason:'TEST 25 ml remain in transit'}];
for(const body of measuredDispatches)command('dispatch_transfer',body);for(const body of measuredReceipts)command('receive_transfer',body);
const measuredCount={...ctx(91),countId:id(109),productId:id(95),batchId:null,reason:'TEST blind measured 245 ml after closed shifts'};command('start_blind_count',measuredCount,'postgres',16);
const measuredObservations=[{...ctx(91),countId:id(109),stage:'first',observationId:id(110),quantity:'0.245',notes:'TEST actual 245 ml first measurement'},{...ctx(91),countId:id(109),stage:'recount',observationId:id(111),quantity:'0.245',notes:'TEST independent 0.245 liter measurement'}];
command('record_blind_count',measuredObservations[0],'postgres',16);command('record_blind_count',measuredObservations[1],'postgres',17);
// Meter/ml refund cash and a linked measured delivery correction are retained through restoration.
sql(`insert into public.branches(id,organization_id,name,code) values('${id(120)}','${id(2)}','TEST measured refund restore','RESTORE7'),('${id(130)}','${id(2)}','TEST measured correction restore','RESTORE8');`);
command('register_device',{...ctx(120),deviceId:id(121),name:'TEST measured refund drawer'});
command('receive_stock',{...ctx(120),receiptId:id(122),source:'purchase',reference:'TEST measured refund opening',items:[{productId:id(94),unitId:id(96),quantity:'1'},{productId:id(95),unitId:id(97),quantity:'20'}]});
const measuredRefundShift=command('open_shift',{...ctx(120),deviceId:id(121),openingCash:10000});
const measuredRefundSale={...sale,...ctx(120),transactionId:id(123),deviceId:id(121),shiftId:measuredRefundShift.shiftId,total:6000,cashReceived:10000,items:[{productId:id(94),unitId:id(96),batchId:null,name:'TEST restored rope',unitName:'100 meter roll',quantity:'0.01',factor:'100',unitPrice:150000,unitCost:100000,priceVersion:1,lineTotal:1500},{productId:id(95),unitId:id(97),batchId:null,name:'TEST restored liquid',unitName:'500 ml container',quantity:'1',factor:'0.5',unitPrice:4500,unitCost:2500,priceVersion:1,lineTotal:4500}]};command('record_sale',measuredRefundSale);
const measuredRefundRequest={...ctx(120),saleId:id(123),refundId:id(125),shiftId:measuredRefundShift.shiftId,expectedRefundVersion:0,expectedAmount:1500,reference:'TEST measured refund',reason:'TEST physical meter and ml mixed returns',physicalConfirmed:true,items:[{lineIndex:0,quantity:'0.0025',returnedQuantity:'0.002',disposition:'mixed',resalableQuantity:'0.0015'},{lineIndex:1,quantity:'0.25',returnedQuantity:'0.2',disposition:'mixed',resalableQuantity:'0.08'}]};command('partial_refund_sale',measuredRefundRequest);
const measuredRefundCheck=command('refund_correction_check',{...ctx(120),saleId:id(123),refundId:id(125),refundKind:'partial',shiftId:measuredRefundShift.shiftId});
const measuredRefundCorrection={...ctx(120),saleId:id(123),refundId:id(125),refundKind:'partial',correctionId:id(126),shiftId:measuredRefundShift.shiftId,expectedLedgerRevision:measuredRefundCheck.ledgerRevision,expectedRefundVersion:measuredRefundCheck.refundVersion,cashRestoredCentavos:1500,reference:'TEST measured refund cash recovered',reason:'TEST complete cash and measured stock evidence',cashConfirmed:true,goodsConfirmed:true,queuesConfirmed:true};command('correct_refund',measuredRefundCorrection);
const measuredRefundReplacement={...ctx(120),saleId:id(123),refundId:id(127),shiftId:measuredRefundShift.shiftId,correctsCorrectionId:id(126),expectedRefundVersion:2,expectedAmount:638,reference:'TEST corrected measured refund',reason:'TEST 125 mm and 50 ml financially refunded without returning goods',physicalConfirmed:true,items:[{lineIndex:0,quantity:'0.00125',returnedQuantity:'0',disposition:'not_returned'},{lineIndex:1,quantity:'0.1',returnedQuantity:'0',disposition:'not_returned'}]};command('partial_refund_sale',measuredRefundReplacement);command('close_shift',{...ctx(120),deviceId:id(121),shiftId:measuredRefundShift.shiftId,countedCash:15362});
const measuredCorrectionOrder={...ctx(130),purchaseOrderId:id(131),supplierId:id(40),reference:'TEST measured correction order',reason:'TEST original roll and container commitment',items:[{lineId:id(132),productId:id(94),unitId:id(96),quantity:'2'},{lineId:id(133),productId:id(95),unitId:id(97),quantity:'6'}]};command('create_purchase_order',measuredCorrectionOrder);command('purchase_order_event',{...ctx(130),purchaseOrderId:id(131),orderEventId:id(134),expectedState:'pending',outcome:'approve',reason:'TEST owner approved measured commitment'});
const measuredMistake={...measuredInspection,...ctx(130),purchaseOrderId:id(131),receiptId:id(135),reference:'TEST measured original mistake',items:measuredInspection.items.map((i,n)=>({...i,orderLineId:id(n?133:132)}))};command('inspect_delivery',measuredMistake);
const measuredReversalCheck=command('delivery_reversal_check',{...ctx(130),receiptId:id(135)});
const measuredReversal={...ctx(130),receiptId:id(135),reversalId:id(136),expectedLedgerRevision:measuredReversalCheck.ledgerRevision,expectedOrderVersion:measuredReversalCheck.orderVersion,reference:'TEST measured delivery reversal',reason:'TEST physical goods checked and all branch PCs synchronized',physicalConfirmed:true,queuesConfirmed:true};command('reverse_delivery',measuredReversal);
const measuredCorrected={...measuredMistake,receiptId:id(137),correctsInspectionId:id(135),expectedReversalId:id(136),reference:'TEST measured linked corrected goods',items:[{...measuredMistake.items[0],documentQuantity:'0.13',accepted:'0.125',held:'0.0025',rejected:'0.0025'},{...measuredMistake.items[1],documentQuantity:'0.4',accepted:'0.25',held:'0.05',rejected:'0.1'}]};command('inspect_delivery',measuredCorrected);
// Measured damage, partially resolved holds and purchase-cost history survive restoration.
sql(`insert into public.branches(id,organization_id,name,code) values('${id(140)}','${id(2)}','TEST measured damage restore','RESTORE9');`);
command('receive_stock',{...ctx(140),receiptId:id(141),source:'purchase',reference:'TEST measured damage opening',items:[{productId:id(94),unitId:id(96),quantity:'1'},{productId:id(95),unitId:id(97),quantity:'20'}]});
const measuredDamageIssue={...ctx(140),issueId:id(142),productId:id(95),batchId:null,quantity:'0.25',category:'damage',disposition:'hold',reason:'TEST 250 ml physically segregated for inspection'};command('record_stock_issue',measuredDamageIssue);const measuredDamageApproval={...ctx(140),issueId:id(142),reason:'TEST owner approved measured damage inspection'};command('approve_stock_issue',measuredDamageApproval);
const measuredDamageHold=sql(`select id from public.stock_holds where source_id='${id(142)}';`).trim();
const measuredHeldRelease={...ctx(140),holdId:measuredDamageHold,dispositionId:id(143),quantity:'0.1',disposition:'release',reason:'TEST 100 ml inspected saleable'};
const measuredHeldDisposal={...ctx(140),holdId:measuredDamageHold,dispositionId:id(144),quantity:'0.125',disposition:'dispose',reason:'TEST 125 ml physically disposed'};command('disposition_hold',measuredHeldRelease);command('disposition_hold',measuredHeldDisposal);
const measuredRopeDamage={...ctx(140),issueId:id(145),productId:id(94),batchId:null,quantity:'0.25',category:'damage',disposition:'write_off',reason:'TEST quarter meter confirmed unusable'};command('record_stock_issue',measuredRopeDamage);const measuredRopeApproval={...ctx(140),issueId:id(145),reason:'TEST owner checked damaged rope length'};command('approve_stock_issue',measuredRopeApproval);
const measuredRopeLossKey='movement:'+sql(`select id from public.inventory_movements where source_id='${id(145)}' and kind='loss';`).trim();
const measuredDamageCosts=[{...ctx(140),lossKey:'held:'+id(144),costEvidenceId:id(146),expectedCostId:null,unitId:id(97),unitCostCentavos:'2500',zeroCostConfirmed:false,reference:'TEST supplier cost per 500 ml container',reason:'TEST documented container cost'},{...ctx(140),lossKey:measuredRopeLossKey,costEvidenceId:id(147),expectedCostId:null,unitId:id(96),unitCostCentavos:'100000',zeroCostConfirmed:false,reference:'TEST supplier cost per 100 meter roll',reason:'TEST documented roll purchase cost'}];for(const body of measuredDamageCosts)command('record_loss_cost',body);
const measuredDamageCostCorrection={...measuredDamageCosts[0],costEvidenceId:id(148),expectedCostId:id(146),unitCostCentavos:'3000',reference:'TEST corrected 500 ml container invoice',reason:'TEST corrected documented cost retains earlier evidence'};command('record_loss_cost',measuredDamageCostCorrection);
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
  assert.equal(command('partial_refund_sale',partialRequest,database).duplicate,true);
  for(const [action,payload] of [['correct_refund',refundCorrection],['partial_refund_sale',mistakenRefund],['partial_refund_sale',replacementRefund]])assert.equal(command(action,payload,database).duplicate,true);
  const correctedHistory=command('partial_refund_history',{...ctx(80),saleId:id(83)},database).rows;
  assert.equal(correctedHistory.find(r=>r.id===id(84)).correction.replacementId,id(86));
  assert.equal(correctedHistory.find(r=>r.id===id(86)).correctsCorrectionId,id(85));
  assert.equal(command('partial_refund_plan',{...ctx(80),saleId:id(83)},database).remainingCash,2400);
  assert.equal(command('snapshot',{...ctx(80),transactionIds:[]},database).stocks[0].quantity,'4.125000');
  assert.equal(Number(sql(`select expected_cash from public.cashier_shifts where id='${correctionShift.shiftId}';`,database).trim()),12400);
  for(const [action,body] of [['create_purchase_order',measuredOrder],['purchase_order_event',measuredApproval],['inspect_delivery',measuredInspection],...measuredDispatches.map(b=>['dispatch_transfer',b]),...measuredReceipts.map(b=>['receive_transfer',b])])assert.equal(command(action,body,database).duplicate,true);
  command('record_blind_count',measuredObservations[0],database,16);command('record_blind_count',measuredObservations[1],database,17);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(90)}' and product_id='${id(94)}';`,database).trim()),87.25);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(90)}' and product_id='${id(95)}';`,database).trim()),1.625);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(91)}' and product_id='${id(95)}';`,database).trim()),0.25);
  assert.equal(Number(sql(`select quantity-received_quantity-held_quantity-lost_quantity from public.stock_transfers where id='${id(106)}';`,database).trim()),0.025);
  assert.equal(command('count_workspace',ctx(91),database).rows[0].counted,'0.245000');
  assert.equal(command('record_sale',measuredRefundSale,database).status,'duplicate');
  for(const [action,body] of [['partial_refund_sale',measuredRefundRequest],['correct_refund',measuredRefundCorrection],['partial_refund_sale',measuredRefundReplacement],['reverse_delivery',measuredReversal],['inspect_delivery',measuredCorrected]])assert.equal(command(action,body,database).duplicate,true);
  assert.equal(command('partial_refund_plan',{...ctx(120),saleId:id(123)},database).remainingCash,5362);
  assert.equal(Number(sql(`select expected_cash from public.cashier_shifts where id='${measuredRefundShift.shiftId}';`,database).trim()),15362);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(120)}' and product_id='${id(95)}';`,database).trim()),9.5);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(130)}' and product_id='${id(95)}';`,database).trim()),0.125);
  assert.equal(command('purchasing_workspace',ctx(130),database).orders[0].lines[1].remaining,'2.85');
  for(const [action,body] of [['record_stock_issue',measuredDamageIssue],['approve_stock_issue',measuredDamageApproval],['disposition_hold',measuredHeldRelease],['disposition_hold',measuredHeldDisposal],['record_stock_issue',measuredRopeDamage],['approve_stock_issue',measuredRopeApproval],...measuredDamageCosts.map(body=>['record_loss_cost',body]),['record_loss_cost',measuredDamageCostCorrection]])assert.equal(command(action,body,database).duplicate,true);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(140)}' and product_id='${id(95)}';`,database).trim()),9.85);
  assert.equal(Number(sql(`select remaining from public.stock_holds where id='${measuredDamageHold}';`,database).trim()),0.025);
  assert.equal(command('stock_loss_report',ctx(140),database).totals.documentedLossCentavos,'1000');
  assert.equal(command('loss_cost_history',{...ctx(140),lossKey:'held:'+id(144)},database).rows.length,2);
  const restoredRefund=command('partial_refund_plan',{...ctx(70),saleId:id(72)},database);
  assert.equal(restoredRefund.remainingCash,1600);assert.equal(restoredRefund.lines[0].remainingQuantity,'0.5');
  assert.equal(command('partial_refund_history',{...ctx(70),saleId:id(72)},database).rows[0].amount,1600);
  assert.equal(Number(sql(`select expected_cash from public.cashier_shifts where id='${partialShift.shiftId}';`,database).trim()),11600);
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
  assert.equal(controls.holdCount,controls.holds.length);
  assert.equal(controls.issueCount,controls.issues.length);
  assert.equal(controls.holdsNext,null);assert.equal(controls.issuesNext,null);
  assert.equal(controls.holds[0].base_unit,"kg");assert.equal(typeof controls.holds[0].product_name,"string");
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
  const nextRefundShift=command('open_shift',{...ctx(70),deviceId:id(71),openingCash:2000},database);
  command('partial_refund_sale',{...partialRequest,refundId:id(75),shiftId:nextRefundShift.shiftId,expectedRefundVersion:1,reference:'TEST restored remainder refund',items:[{lineIndex:0,quantity:'0.5',returnedQuantity:'0',disposition:'not_returned'}]},database);
  assert.equal(command('partial_refund_plan',{...ctx(70),saleId:id(72)},database).remainingCash,0);
  assert.equal(command('snapshot',{...ctx(70),transactionIds:[]},database).stocks[0].quantity,'4.250000');
  command('close_shift',{...ctx(70),deviceId:id(71),shiftId:nextRefundShift.shiftId,countedCash:400},database);
  assert.equal(Number(sql(`select expected_cash from public.cashier_shifts where id='${nextRefundShift.shiftId}';`,database).trim()),400);
  const resumedCorrectionShift=command('open_shift',{...ctx(80),deviceId:id(81),openingCash:5000},database);
  command('partial_refund_sale',{...replacementRefund,refundId:id(87),shiftId:resumedCorrectionShift.shiftId,correctsCorrectionId:undefined,expectedRefundVersion:3,expectedAmount:2400,reference:'TEST restored remaining corrected refund',items:[{lineIndex:0,quantity:'0.75',returnedQuantity:'0',disposition:'not_returned'}]},database);
  command('close_shift',{...ctx(80),deviceId:id(81),shiftId:resumedCorrectionShift.shiftId,countedCash:2600},database);
  assert.equal(Number(sql(`select expected_cash from public.cashier_shifts where id='${resumedCorrectionShift.shiftId}';`,database).trim()),2600);
  const measuredRemainderShift=command('open_shift',{...ctx(120),deviceId:id(121),openingCash:10000},database);
  command('partial_refund_sale',{...measuredRefundReplacement,refundId:id(128),shiftId:measuredRemainderShift.shiftId,correctsCorrectionId:undefined,expectedRefundVersion:3,expectedAmount:5362,reference:'TEST restored measured remainder',items:[{lineIndex:0,quantity:'0.00875',returnedQuantity:'0',disposition:'not_returned'},{lineIndex:1,quantity:'0.9',returnedQuantity:'0',disposition:'not_returned'}]},database);
  assert.equal(command('partial_refund_plan',{...ctx(120),saleId:id(123)},database).remainingCash,0);
  command('close_shift',{...ctx(120),deviceId:id(121),shiftId:measuredRemainderShift.shiftId,countedCash:4638},database);
  assert.equal(Number(sql(`select expected_cash from public.cashier_shifts where id='${measuredRemainderShift.shiftId}';`,database).trim()),4638);
  const measuredCorrectedHold=sql(`select hold_id from app_private.delivery_inspection_lines where inspection_id='${id(137)}' and product_id='${id(95)}';`,database,'supabase_admin').trim();
  command('disposition_hold',{...ctx(130),holdId:measuredCorrectedHold,dispositionId:id(138),quantity:'0.025',disposition:'release',reason:'TEST restored 25 ml inspected and released'},database);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(130)}' and product_id='${id(95)}';`,database).trim()),0.15);
  command('disposition_hold',{...ctx(140),holdId:measuredDamageHold,dispositionId:id(149),quantity:'0.025',disposition:'supplier_return',reason:'TEST remaining 25 ml physically returned after restoration'},database);
  command('record_loss_cost',{...measuredDamageCosts[0],lossKey:'held:'+id(149),costEvidenceId:id(150),unitCostCentavos:'2500',reference:'TEST measured supplier return cost'},database);
  const measuredDamageReport=command('stock_loss_report',{...ctx(140),filter:'all'},database);assert.equal(measuredDamageReport.totals.documentedLossCentavos,'1000');assert.equal(measuredDamageReport.totals.documentedOtherCentavos,'125');
  assert.equal(measuredDamageReport.rows.find(r=>r.product_id===id(95)).purchase_units.find(u=>u.id===id(97)).factor,'0.500000');
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(140)}' and product_id='${id(95)}';`,database).trim()),9.85);
  assert.equal(Number(sql(`select remaining from public.stock_holds where id='${measuredDamageHold}';`,database).trim()),0);
  assert.throws(()=>sql(`update public.sale_refund_corrections set amount=1 where id='${id(85)}';`,database),/History is immutable/);
  assert.throws(()=>sql(`delete from app_private.refund_correction_replacements where correction_id='${id(85)}';`,database,'supabase_admin'),/History is immutable/);
  command('approve_count',{...ctx(91),countId:id(109),reason:'TEST independent owner verified 245 ml after restoration'},database);
  for(const [transferId,receiptId,quantity] of [[id(105),id(112),'0.25'],[id(106),id(113),'0.025']])command('write_off_transfer',{...ctx(91),transferId,receiptId,quantity,reason:'TEST owner reconciled missing goods after restoration'},database);
  const restoredMeterCount={...ctx(91),countId:id(114),productId:id(94),batchId:null,reason:'TEST post-restore physical meter count'};command('start_blind_count',restoredMeterCount,database,16);
  for(const [actor,stage,observationId] of [[16,'first',id(115)],[17,'recount',id(116)]])command('record_blind_count',{...ctx(91),countId:id(114),stage,observationId,quantity:'12.125',notes:'TEST independent actual meter measurement'},database,actor);
  command('approve_count',{...ctx(91),countId:id(114),reason:'TEST third-person owner approved actual rope length'},database);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(91)}' and product_id='${id(94)}';`,database).trim()),12.125);
  assert.equal(Number(sql(`select quantity from public.branch_inventory where branch_id='${id(91)}' and product_id='${id(95)}';`,database).trim()),0.245);
  assert.equal(Number(sql(`select remaining from public.stock_holds where source_id='${id(108)}';`,database).trim()),0.1);
  assert.throws(()=>sql(`update app_private.partial_refund_lines set amount=1 where refund_id='${id(74)}';`,database,'supabase_admin'),/History is immutable/);
  assert.throws(()=>sql(`delete from app_private.delivery_reversals where id='${id(65)}';`,database,'supabase_admin'),/History is immutable/);
  assert.throws(()=>sql(`update app_private.delivery_inspection_lines set rejected=0 where inspection_id='${id(44)}';`,database,'supabase_admin'),/History is immutable/);
  assert.throws(()=>sql(`update public.sales set total=1 where id='${id(9)}';`,database),/History is immutable/);
  assert.equal(Number(sql(`select count(*) from public.branch_inventory i where i.organization_id='${id(2)}' and i.quantity<>(select sum(m.quantity) from public.inventory_movements m where m.organization_id=i.organization_id and m.branch_id=i.branch_id and m.product_id=i.product_id and m.batch_id is not distinct from i.batch_id);`,database).trim()),0);
  console.log(
    `Restore drill passed: ${tables.length} table content fingerprints, measured damage/hold release/disposal and post-restore supplier return with separate documented purchase costs and retained corrections, original-pack meter/ml refund/correction/replacement cash and post-restore remainder allocation, linked measured delivery reversal/correction and post-restore 25 ml hold release, measured meter/liter orders, inspections, held goods, partial transfer receipts, remaining in-transit goods and separate-person post-restore counts, corrected-refund recovered cash, linked replacement, post-restore remaining refund, partial-refund cash/stock and remaining allocations, immutable delivery reversal and movement lineage, correctly reopened order and linked corrected receipt, safe original retries and post-restore corrected-hold release, rejected deliveries and supplier claims, replacement receiving, purchase-cost evidence, independent counts, original sale/payment/refund, zero duplicate effects and zero ledger/projection differences. Disposable CI dump only; production cloud backup not certified.`,
  );
} finally {
  run(["dropdb", "-U", "postgres", database]);
}
