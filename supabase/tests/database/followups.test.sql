begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create temporary table tap_results(line text);
grant all on tap_results to authenticated;
create function pg_temp.i(n integer) returns uuid language sql immutable as $$select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.login(n integer) returns text language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(n),'role','authenticated','session_id',pg_temp.i(n),'is_anonymous',false)::text,true)$$;
insert into auth.users(id,email) values(pg_temp.i(11),'agri-owner@example.invalid'),(pg_temp.i(12),'agri-cashier@example.invalid'),(pg_temp.i(13),'agri-stock@example.invalid'),(pg_temp.i(14),'agri-manager@example.invalid'),(pg_temp.i(15),'agri-other@example.invalid');
insert into auth.sessions(id,user_id) select pg_temp.i(n),pg_temp.i(n) from generate_series(11,15) n;
insert into public.organizations(id,name) values(pg_temp.i(1),'TEST AgriStore'),(pg_temp.i(2),'TEST Other business');
insert into public.branches(id,organization_id,name,code) values(pg_temp.i(101),pg_temp.i(1),'Test branch 1','T1'),(pg_temp.i(102),pg_temp.i(1),'Test branch 2','T2'),(pg_temp.i(103),pg_temp.i(1),'Test branch 3','T3'),(pg_temp.i(201),pg_temp.i(2),'Other branch','OTHER');
insert into public.staff_memberships(organization_id,user_id,branch_id,role,name) values(pg_temp.i(1),pg_temp.i(11),null,'owner','Owner'),(pg_temp.i(1),pg_temp.i(12),pg_temp.i(101),'cashier','Cashier'),(pg_temp.i(1),pg_temp.i(13),pg_temp.i(101),'stock_staff','Stock'),(pg_temp.i(1),pg_temp.i(14),pg_temp.i(102),'manager','Manager'),(pg_temp.i(2),pg_temp.i(15),null,'owner','Other');
insert into public.devices(id,organization_id,branch_id,name,registered_by) values(pg_temp.i(501),pg_temp.i(1),pg_temp.i(101),'Test PC1',pg_temp.i(11)),(pg_temp.i(502),pg_temp.i(1),pg_temp.i(102),'Test PC2',pg_temp.i(11));
insert into public.products(id,organization_id,name,sku,base_unit) values(pg_temp.i(301),pg_temp.i(1),'Grower feeds','TEST-FEED','kg'),(pg_temp.i(302),pg_temp.i(2),'Private product','PRIVATE','kg');
insert into public.product_units(id,organization_id,product_id,name,factor) values(pg_temp.i(401),pg_temp.i(1),pg_temp.i(301),'Sack',50),(pg_temp.i(402),pg_temp.i(2),pg_temp.i(302),'Kilo',1);
insert into public.unit_prices(organization_id,unit_id,version,price,cost) values(pg_temp.i(1),pg_temp.i(401),1,150000,120000),(pg_temp.i(2),pg_temp.i(402),1,10000,8000);
insert into public.inventory_movements(organization_id,branch_id,product_id,quantity,kind,source_id,created_by) values(pg_temp.i(1),pg_temp.i(101),pg_temp.i(301),500,'opening',pg_temp.i(601),pg_temp.i(11)),(pg_temp.i(1),pg_temp.i(102),pg_temp.i(301),200,'opening',pg_temp.i(602),pg_temp.i(11));
insert into auth.users(id,email) select pg_temp.i(n),'followup-'||n||'@example.invalid' from generate_series(16,18) n;
insert into auth.sessions(id,user_id) select pg_temp.i(n),pg_temp.i(n) from generate_series(16,18) n;
insert into public.staff_memberships(organization_id,user_id,branch_id,role,name,active) values
 (pg_temp.i(1),pg_temp.i(16),pg_temp.i(101),'manager','Branch manager',true),
 (pg_temp.i(1),pg_temp.i(17),pg_temp.i(101),'stock_staff','Other stock staff',true),
 (pg_temp.i(1),pg_temp.i(18),pg_temp.i(101),'stock_staff','Revoked staff',false);
update public.products set tracks_expiry=true where id=pg_temp.i(301);
insert into public.product_batches(id,organization_id,product_id,lot,expires_on) values
 (pg_temp.i(850),pg_temp.i(1),pg_temp.i(301),'Expired',timezone('Asia/Manila',now())::date-1),
 (pg_temp.i(851),pg_temp.i(1),pg_temp.i(301),'Soon',timezone('Asia/Manila',now())::date+7),
 (pg_temp.i(852),pg_temp.i(1),pg_temp.i(301),'Today',timezone('Asia/Manila',now())::date),
 (pg_temp.i(853),pg_temp.i(1),pg_temp.i(301),'Later',timezone('Asia/Manila',now())::date+60),
 (pg_temp.i(854),pg_temp.i(1),pg_temp.i(301),'Empty expired',timezone('Asia/Manila',now())::date-5),
 (pg_temp.i(855),pg_temp.i(1),pg_temp.i(301),'Unknown',null);
insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by)
 select pg_temp.i(1),pg_temp.i(101),pg_temp.i(301),pg_temp.i(n),10,'opening',pg_temp.i(n+100),pg_temp.i(11) from unnest(array[850,851,852,853,855]) n;
insert into public.stock_exceptions(id,organization_id,branch_id,kind,source_id,created_at) values
 (pg_temp.i(801),pg_temp.i(1),pg_temp.i(101),'TEST discrepancy',pg_temp.i(901),now()-interval '10 days'),
 (pg_temp.i(802),pg_temp.i(1),pg_temp.i(102),'TEST other branch',pg_temp.i(902),now());
create function pg_temp.ctx(b integer default 101) returns jsonb language sql as $$select jsonb_build_object('organizationId',pg_temp.i(1),'branchId',pg_temp.i(b))$$;
create function pg_temp.work(extra jsonb default '{}') returns jsonb language sql as $$select public.agri_command('stock_followups',pg_temp.ctx()||extra)$$;
create function pg_temp.assignment() returns jsonb language sql as $$select pg_temp.ctx()||jsonb_build_object('exceptionId',pg_temp.i(801),'assigneeId',pg_temp.i(13),'dueOn',(timezone('Asia/Manila',now())::date-1)::text,'reason','TEST inspect supplier documents','followUpId',pg_temp.i(950),'expectedVersion',0)$$;
set local role authenticated;
select pg_temp.login(11);
insert into tap_results select is(pg_temp.work()->>'today',(timezone('Asia/Manila',now())::date)::text,'Business date is Manila date');
insert into tap_results select is(pg_temp.work()->'expiryTotals'->>'expired','1','Only physically present expired lot is listed');
insert into tap_results select is(pg_temp.work()->'expiryTotals'->>'today','1','Expiry today is distinct from already expired');
insert into tap_results select is(pg_temp.work()->'expiryTotals'->>'soon','1','Future lot outside window is excluded');
insert into tap_results select is(pg_temp.work()->'expiryTotals'->>'missing','2','Unknown date and unbatched tracked stock need label checks');
insert into tap_results select is(pg_temp.work('{"horizonDays":90}')->'expiryTotals'->>'soon','2','Longer lookahead includes later lot');
insert into tap_results select is(jsonb_array_length(pg_temp.work('{"expiryFilter":"expired"}')->'expiry'),1,'Expiry filters apply at server');
insert into tap_results select throws_ok($$select pg_temp.work('{"horizonDays":900}')$$,'P0001','Choose a valid worklist filter','Unbounded lookahead rejected');
insert into tap_results select lives_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment())$$,'Owner assigns an active branch staff account');
insert into tap_results select lives_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment())$$,'Lost assignment response retries original request');
insert into tap_results select is((select count(*) from public.stock_control_events where action='assign_stock_exception'),1::bigint,'Retry keeps one immutable assignment event');
insert into tap_results select is((select follow_up_version from public.stock_exceptions where id=pg_temp.i(801)),1,'Retry does not increment version twice');
insert into tap_results select is(pg_temp.work()->'totals'->>'open','1','Assignment keeps investigation open');
insert into tap_results select is(pg_temp.work()->'totals'->>'overdue','1','Missed deadline is visible');
insert into tap_results select is(pg_temp.work()->'totals'->>'unassigned','0','Valid account is assigned');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||'{"reason":"Changed contents"}')$$,'P0001','Follow-up request ID conflict','Changed retry contents cannot overwrite evidence');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||jsonb_build_object('followUpId',pg_temp.i(951)))$$,'P0001','This follow-up changed. Refresh before editing','Stale assignment cannot overwrite a newer version');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||jsonb_build_object('followUpId',pg_temp.i(952),'expectedVersion',1,'assigneeId',pg_temp.i(12)))$$,'P0001','Choose an active stock employee, branch manager or owner for this branch','Cashier cannot be assigned stock investigation');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||jsonb_build_object('followUpId',pg_temp.i(952),'expectedVersion',1,'assigneeId',pg_temp.i(14)))$$,'P0001','Choose an active stock employee, branch manager or owner for this branch','Other branch employee cannot be assigned');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||jsonb_build_object('followUpId',pg_temp.i(952),'expectedVersion',1,'assigneeId',pg_temp.i(15)))$$,'P0001','Choose an active stock employee, branch manager or owner for this branch','Other organization owner cannot be assigned');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||jsonb_build_object('followUpId',pg_temp.i(952),'expectedVersion',1,'assigneeId',pg_temp.i(18)))$$,'P0001','Choose an active stock employee, branch manager or owner for this branch','Inactive staff cannot be assigned');
select pg_temp.login(12);
insert into tap_results select throws_ok($$select pg_temp.work()$$,'42501','Stock follow-up access denied','Cashier cannot read follow-up workspace');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment())$$,'42501','Stock follow-up access denied','Cashier cannot reuse a valid owner request');
select pg_temp.login(15);
insert into tap_results select throws_ok($$select pg_temp.work()$$,'42501','You do not have access to this branch','Other organization cannot read reminders');
select pg_temp.login(14);
insert into tap_results select throws_ok($$select pg_temp.work()$$,'42501','You do not have access to this branch','Manager cannot cross branch boundary');
select pg_temp.login(17);
insert into tap_results select throws_ok($$select public.agri_command('note_stock_exception',pg_temp.ctx()||jsonb_build_object('exceptionId',pg_temp.i(801),'expectedVersion',1,'reason','TEST not my case','followUpId',pg_temp.i(953)))$$,'42501','Only the assigned employee, branch manager or owner can record progress','Unassigned stock employee cannot edit another case');
select pg_temp.login(13);
insert into tap_results select is(jsonb_array_length(pg_temp.work('{"filter":"mine"}')->'cases'),1,'Assignee can find own case');
insert into tap_results select throws_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||jsonb_build_object('followUpId',pg_temp.i(953),'expectedVersion',1))$$,'42501','Only an owner or branch manager can assign investigations','Stock staff cannot change responsibility');
insert into tap_results select lives_ok($$select public.agri_command('note_stock_exception',pg_temp.ctx()||jsonb_build_object('exceptionId',pg_temp.i(801),'expectedVersion',1,'reason','TEST supplier response pending','followUpId',pg_temp.i(953)))$$,'Assignee records progress');
insert into tap_results select lives_ok($$select public.agri_command('note_stock_exception',pg_temp.ctx()||jsonb_build_object('exceptionId',pg_temp.i(801),'expectedVersion',1,'reason','TEST supplier response pending','followUpId',pg_temp.i(953)))$$,'Progress retry preserves original event');
insert into tap_results select is(pg_temp.work()->'totals'->>'overdue','1','Progress note does not dismiss overdue reminder');
insert into tap_results select is(pg_temp.work()->'totals'->>'open','1','Progress does not resolve case');
insert into tap_results select is((select quantity::text from public.branch_inventory where branch_id=pg_temp.i(101) and batch_id is null),'500.000000','Assignments and progress never change stock');
insert into tap_results select throws_ok($$update public.stock_exceptions set due_on=current_date$$,'42501',null,'Direct client assignment updates denied');
select pg_temp.login(16);
insert into tap_results select lives_ok($$select public.agri_command('assign_stock_exception',pg_temp.assignment()||jsonb_build_object('followUpId',pg_temp.i(954),'expectedVersion',2,'assigneeId',pg_temp.i(17)))$$,'Authorized branch manager can reassign with new evidence');
insert into tap_results select throws_ok($$select public.agri_command('resolve_stock_exception',pg_temp.ctx()||jsonb_build_object('exceptionId',pg_temp.i(801),'reason','TEST manager closure forbidden'))$$,'42501','Only the owner can resolve a stock investigation','Manager still cannot resolve');
select pg_temp.login(11);
insert into tap_results select lives_ok($$select public.agri_command('resolve_stock_exception',pg_temp.ctx()||jsonb_build_object('exceptionId',pg_temp.i(801),'reason','TEST owner verified documents and recorded outcome'))$$,'Owner resolves with evidence');
insert into tap_results select is(pg_temp.work()->'totals'->>'open','0','Only resolution removes case from open worklist');
insert into tap_results select throws_ok($$select public.agri_command('note_stock_exception',pg_temp.ctx()||jsonb_build_object('exceptionId',pg_temp.i(801),'expectedVersion',3,'reason','TEST late progress','followUpId',pg_temp.i(955)))$$,'P0001','This investigation is resolved. Refresh the worklist','Late progress cannot reopen resolved case');
reset role;
insert into public.stock_exceptions(id,organization_id,branch_id,kind,source_id,created_at) select pg_temp.i(1000+n),pg_temp.i(1),pg_temp.i(101),'TEST page',pg_temp.i(2000+n),now()+n*interval '1 second' from generate_series(1,60) n;
set local role authenticated;
select pg_temp.login(11);
insert into tap_results select is(pg_temp.work()->'totals'->>'open','60','Total includes every unresolved case beyond first page');
insert into tap_results select is(jsonb_array_length(pg_temp.work()->'cases'),50,'First case page is bounded');
insert into tap_results select is(jsonb_array_length(pg_temp.work(jsonb_build_object('cursor',pg_temp.work()->'next'))->'cases'),10,'Older-first cursor reaches all remaining cases');
insert into tap_results select is(jsonb_array_length(pg_temp.work('{"filter":"overdue"}')->'cases'),0,'Resolved overdue case is not silently reintroduced');
reset role;
insert into public.product_batches(id,organization_id,product_id,lot,expires_on) select pg_temp.i(3000+n),pg_temp.i(1),pg_temp.i(301),'TEST expiry page '||n,timezone('Asia/Manila',now())::date+1 from generate_series(1,55) n;
insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) select pg_temp.i(1),pg_temp.i(101),pg_temp.i(301),pg_temp.i(3000+n),1,'opening',pg_temp.i(4000+n),pg_temp.i(11) from generate_series(1,55) n;
set local role authenticated;
select pg_temp.login(11);
insert into tap_results select is(jsonb_array_length(pg_temp.work()->'expiry'),50,'Expiry worklist is bounded');
insert into tap_results select is(jsonb_array_length(pg_temp.work(jsonb_build_object('expiryCursor',pg_temp.work()->'expiryNext'))->'expiry'),10,'Expiry cursor reaches all 60 matching lots');
insert into tap_results select lives_ok($$select public.agri_command('record_stock_issue',pg_temp.ctx()||jsonb_build_object('issueId',pg_temp.i(6000),'productId',pg_temp.i(301),'batchId',pg_temp.i(850),'quantity','10','category','expiry','disposition','hold','reason','TEST all expired goods held'))$$,'Request holds entire expired lot');
insert into tap_results select lives_ok($$select public.agri_command('approve_stock_issue',pg_temp.ctx()||jsonb_build_object('issueId',pg_temp.i(6000),'reason','TEST owner inspected labels'))$$,'Owner approves complete expiry hold');
insert into tap_results select is((select value->>'saleable' from jsonb_array_elements(pg_temp.work('{"expiryFilter":"expired"}')->'expiry') where value->>'batch_id'=pg_temp.i(850)::text),'0.000000','Expired lot with zero saleable balance remains visible');
insert into tap_results select is((select value->>'held' from jsonb_array_elements(pg_temp.work('{"expiryFilter":"expired"}')->'expiry') where value->>'batch_id'=pg_temp.i(850)::text),'10.000000','Held expired stock remains in reminders until physical disposition');
reset role;
update public.stock_exceptions set assigned_user_id=pg_temp.i(18),assigned_to='Revoked staff',due_on=current_date where id=pg_temp.i(1001);
set local role authenticated;
select pg_temp.login(11);
insert into tap_results select is((pg_temp.work('{"filter":"unassigned"}')->'cases'->0->>'assignee_active')::boolean,false,'Revoked assignee is visibly marked for reassignment');
select pg_temp.login(18);
insert into tap_results select throws_ok($$select pg_temp.work()$$,'42501','You do not have access to this branch','Revoked employee cannot read workspace');
reset role;
insert into tap_results select * from finish();
select line from tap_results;
rollback;
