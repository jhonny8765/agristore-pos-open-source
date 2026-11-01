begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create temporary table tap_results(line text);grant all on tap_results to authenticated;
create function pg_temp.i(n integer) returns uuid language sql immutable as $$select ('79000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email) select pg_temp.i(n),'analytics-'||n||'@example.invalid' from generate_series(1,5)n;
insert into auth.sessions(id,user_id) select pg_temp.i(n),pg_temp.i(n) from generate_series(1,5)n;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(1),'session_id',pg_temp.i(1))::text,true);
set local role authenticated;
select public.agri_command('bootstrap','{"name":"TEST sales analytics"}');
reset role;
create function pg_temp.org() returns uuid language sql stable as $$select organization_id from public.staff_memberships where user_id=pg_temp.i(1)$$;
create function pg_temp.branch(n integer) returns uuid language sql stable as $$select id from public.branches where organization_id=pg_temp.org() and code='B0'||n::text$$;
select set_config('test.analytics_org',pg_temp.org()::text,true),set_config('test.analytics_branch',pg_temp.branch(1)::text,true);
create function pg_temp.request(a text default '2024-02-29',b text default '2024-02-29',grain text default 'day') returns jsonb language sql stable as $$select jsonb_build_object('organizationId',current_setting('test.analytics_org'),'branchId',current_setting('test.analytics_branch'),'period','custom','fromDate',a,'throughDate',b,'interval',grain)$$;
insert into public.staff_memberships(organization_id,user_id,branch_id,role,name) values(pg_temp.org(),pg_temp.i(2),pg_temp.branch(1),'manager','TEST manager'),(pg_temp.org(),pg_temp.i(3),pg_temp.branch(1),'cashier','TEST cashier'),(pg_temp.org(),pg_temp.i(4),pg_temp.branch(2),'manager','TEST other manager');
insert into public.products(id,organization_id,name,sku,base_unit) values(pg_temp.i(10),pg_temp.org(),'TEST feeds','FEED','kg'),(pg_temp.i(11),pg_temp.org(),'TEST seeds','SEED','piece');
insert into public.product_units(id,organization_id,product_id,name,factor) values(pg_temp.i(20),pg_temp.org(),pg_temp.i(10),'Kilo',1),(pg_temp.i(21),pg_temp.org(),pg_temp.i(10),'Sack',50),(pg_temp.i(22),pg_temp.org(),pg_temp.i(11),'Piece',1);
insert into public.devices(id,organization_id,branch_id,name,registered_by) select pg_temp.i(30+n),pg_temp.org(),pg_temp.branch(n),'TEST PC',pg_temp.i(1) from generate_series(1,2)n;
insert into public.cashier_shifts(id,organization_id,branch_id,device_id,cashier_id,opened_at,closed_at,opening_cash,expected_cash,counted_cash) select pg_temp.i(40+n),pg_temp.org(),pg_temp.branch(n),pg_temp.i(30+n),pg_temp.i(1),'2024-02-01Z','2024-03-02Z',0,0,0 from generate_series(1,2)n;
-- Retained historical fixture, including >1000 purchases, actual unit factors,
-- a second branch and the exact Manila leap-day boundary. No wall clock is faked.
insert into public.sales(id,organization_id,branch_id,device_id,cashier_id,shift_id,occurred_at,received_at,total,cash_received,receipt,payload)
 select pg_temp.i(1000+n),pg_temp.org(),pg_temp.branch(1),pg_temp.i(31),pg_temp.i(1),pg_temp.i(41),'2024-02-28 16:00:00Z'::timestamptz+n*interval '1 millisecond','2024-03-01Z',25,25,'TEST-'||n,'{}' from generate_series(1,1005)n;
insert into public.sale_items(organization_id,sale_id,product_id,unit_id,quantity,factor,price,cost,line_total,price_version)
 select pg_temp.org(),pg_temp.i(1000+n),pg_temp.i(10),pg_temp.i(20),0.25,1,100,50,25,1 from generate_series(1,1005)n;
insert into public.sales(id,organization_id,branch_id,device_id,cashier_id,shift_id,occurred_at,total,cash_received,receipt,payload) values
 (pg_temp.i(50),pg_temp.org(),pg_temp.branch(1),pg_temp.i(31),pg_temp.i(1),pg_temp.i(41),'2024-02-29 04:00Z',2600,2600,'TEST mixed units','{}'),
 (pg_temp.i(51),pg_temp.org(),pg_temp.branch(1),pg_temp.i(31),pg_temp.i(1),pg_temp.i(41),'2024-02-28 15:59:59.999999Z',100,100,'TEST prior boundary','{}'),
 (pg_temp.i(52),pg_temp.org(),pg_temp.branch(2),pg_temp.i(32),pg_temp.i(1),pg_temp.i(42),'2024-02-29 04:00Z',99999,99999,'TEST other branch','{}');
insert into public.sale_items(organization_id,sale_id,product_id,unit_id,quantity,factor,price,cost,line_total,price_version) values
 (pg_temp.org(),pg_temp.i(50),pg_temp.i(10),pg_temp.i(20),1,1,100,50,100,1),
 (pg_temp.org(),pg_temp.i(50),pg_temp.i(10),pg_temp.i(21),1,50,2000,1500,2000,1),
 (pg_temp.org(),pg_temp.i(50),pg_temp.i(11),pg_temp.i(22),1,1,500,300,500,1),
 (pg_temp.org(),pg_temp.i(51),pg_temp.i(11),pg_temp.i(22),1,1,100,50,100,1),
 (pg_temp.org(),pg_temp.i(52),pg_temp.i(11),pg_temp.i(22),1,1,99999,50,99999,1);
insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount,created_at) select organization_id,branch_id,id,shift_id,total,occurred_at from public.sales where organization_id=pg_temp.org();
insert into public.inventory_movements(organization_id,branch_id,product_id,quantity,kind,source_id,created_by,created_at) select s.organization_id,s.branch_id,i.product_id,-sum(i.quantity*i.factor),'sale',s.id,pg_temp.i(1),s.occurred_at from public.sales s join public.sale_items i on i.sale_id=s.id where s.organization_id=pg_temp.org() group by s.organization_id,s.branch_id,i.product_id,s.id,s.occurred_at;
insert into public.sale_partial_refunds(id,organization_id,branch_id,sale_id,shift_id,amount,reference,reason,created_by,created_at) values(pg_temp.i(60),pg_temp.org(),pg_temp.branch(1),pg_temp.i(50),pg_temp.i(41),1200,'TEST refund','TEST mistaken refund',pg_temp.i(1),'2024-03-01 00:00Z'),(pg_temp.i(61),pg_temp.org(),pg_temp.branch(1),pg_temp.i(50),pg_temp.i(41),700,'TEST replacement','TEST replacement refund',pg_temp.i(1),'2024-03-01 02:00Z');
insert into public.sale_refund_corrections(id,organization_id,branch_id,sale_id,shift_id,partial_refund_id,amount,reference,reason,ledger_revision,created_by,created_at) values(pg_temp.i(62),pg_temp.org(),pg_temp.branch(1),pg_temp.i(50),pg_temp.i(41),pg_temp.i(60),1200,'TEST correction','TEST recovered cash',0,pg_temp.i(1),'2024-03-01 01:00Z');
insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount,partial_refund_id,created_at) select organization_id,branch_id,sale_id,shift_id,-amount,id,created_at from public.sale_partial_refunds where organization_id=pg_temp.org();
insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount,refund_correction_id,created_at) select organization_id,branch_id,sale_id,shift_id,amount,id,created_at from public.sale_refund_corrections where organization_id=pg_temp.org();
create temporary table before_counts as select (select count(*) from public.sales) sales,(select count(*) from public.payments) payments,(select count(*) from public.inventory_movements) movements;
create temporary table report(data jsonb);grant all on report to authenticated;
set local role authenticated;
insert into report select public.agri_command('sales_analytics',pg_temp.request());
insert into tap_results select is((select data#>>'{totals,salesCount}' from report),'1006','Full period count exceeds the REST row cap');
insert into tap_results select is((select data#>>'{totals,grossSales}' from report),'27725','Gross totals do not multiply on item/payment joins');
insert into tap_results select is((select data#>>'{totals,averageSale}' from report),'28','Average rounds exact integer centavos');
insert into tap_results select is((select data#>>'{previous,grossSales}' from report),'100','Manila midnight excludes the previous microsecond');
insert into tap_results select is((select data#>>'{products,0,purchases}' from report),'1006','Mixed units on one receipt count as one product purchase');
insert into tap_results select is((select data#>>'{products,0,quantity}' from report),'302.25','Quarter kilos and a sack aggregate in exact kg');
insert into tap_results select is((select data#>>'{products,1,base_unit}' from report),'piece','Pieces are never combined into the kilo quantity');
insert into tap_results select is((select data#>>'{products,1,previousPurchases}' from report),'1','Per-product comparison follows the prior period');
insert into tap_results select is((select data#>>'{trend,0,grossSales}' from report),'27725','Trend equals summary for the complete day');
insert into tap_results select is((select data#>>'{totals,refunds}' from report),'0','A later refund does not rewrite original sale-day cash activity');
truncate report;insert into report select public.agri_command('sales_analytics',pg_temp.request('2024-03-01','2024-03-01'));
insert into tap_results select is((select data#>>'{totals,grossSales}' from report),'0','Refund-only day has zero sales');
insert into tap_results select is((select data#>>'{totals,refunds}' from report),'1900','Original and replacement refund payouts are visible');
insert into tap_results select is((select data#>>'{totals,recoveries}' from report),'1200','Recovered mistaken-refund cash is separate');
insert into tap_results select is((select data#>>'{totals,netCash}' from report),'-700','Refund-only net activity can be negative');
insert into tap_results select is((select data#>>'{trend,0,netCash}' from report),'-700','Refund-only trend remains present');
insert into tap_results select is((select jsonb_array_length(data->'products') from report),0,'No fabricated popular product on a refund-only day');
truncate report;insert into report select public.agri_command('sales_analytics',pg_temp.request('2024-02-27','2024-03-02','week'));
insert into tap_results select is((select data#>>'{trend,0,date}' from report),'2024-02-27','Partial weekly bucket starts at selected date');
insert into tap_results select is((select data#>>'{trend,0,throughDate}' from report),'2024-03-02','Partial weekly bucket ends at selected date');
truncate report;insert into report select public.agri_command('sales_analytics',pg_temp.request('2024-02-01','2024-03-02','month'));
insert into tap_results select is((select jsonb_array_length(data->'trend') from report),2,'Monthly grouping includes both months');
insert into tap_results select is((select data#>>'{trend,1,netCash}' from report),'-700','Monthly refund activity matches exact payments');
truncate report;insert into report select public.agri_command('sales_analytics',pg_temp.request('2024-01-01','2024-12-31'));
insert into tap_results select is((select jsonb_array_length(data->'trend') from report),366,'Leap-year daily report includes every zero-sales day');
truncate report;insert into report select public.agri_command('sales_analytics',pg_temp.request()||'{"period":"week"}');
insert into tap_results select is((select data->>'fromDate' from report),date_trunc('week',now() at time zone 'Asia/Manila')::date::text,'This week starts Monday in Manila');
insert into tap_results select is((select data->>'throughDate' from report),(now() at time zone 'Asia/Manila')::date::text,'This week stops at today');
insert into tap_results select is((select data->>'previousFromDate' from report),(date_trunc('week',now() at time zone 'Asia/Manila')::date-7)::text,'Weekly comparison starts seven days earlier');
truncate report;insert into report select public.agri_command('sales_analytics',pg_temp.request()||'{"period":"last_month"}');
insert into tap_results select is((select data->>'fromDate' from report),(date_trunc('month',now() at time zone 'Asia/Manila')-interval '1 month')::date::text,'Last month uses calendar month start');
insert into tap_results select is((select data->>'throughDate' from report),(date_trunc('month',now() at time zone 'Asia/Manila')::date-1)::text,'Last month includes its final day');
truncate report;insert into report select public.agri_command('sales_analytics',pg_temp.request()||'{"period":"year","interval":"month"}');
insert into tap_results select is((select jsonb_array_length(data->'trend') from report),12,'Last twelve months includes all calendar buckets');
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request('2024-02-30','2024-03-01'))$$,'22008',null,'Impossible dates are rejected');
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request('2024-01-01','2025-01-01'))$$,'P0001','Choose an ordered range of at most 366 days','Oversized periods are rejected');
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request('2024-03-02','2024-03-01'))$$,'P0001','Choose an ordered range of at most 366 days','Reversed dates are rejected');
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request()||'{"interval":"hour"}')$$,'P0001','Choose daily, weekly or monthly grouping','Only supported grouping accepted');
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request()||'{"allBranches":true}')$$,'P0001','Select one branch for sales analytics','All-branch bypass rejected');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.branches set active=(id=pg_temp.branch(1)),management_locked=true where organization_id=pg_temp.org();
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(2),'session_id',pg_temp.i(2))::text,true);
set local role authenticated;
insert into tap_results select lives_ok($$select public.agri_command('sales_analytics',pg_temp.request())$$,'Magpet manager can read own fixed branch');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(3),'session_id',pg_temp.i(3))::text,true);
set local role authenticated;
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request())$$,'42501',null,'Cashier cannot read owner analytics');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(4),'session_id',pg_temp.i(4))::text,true);
set local role authenticated;
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request())$$,'42501',null,'Other branch manager cannot read Magpet');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(5),'session_id',pg_temp.i(5))::text,true);
set local role authenticated;
insert into tap_results select throws_ok($$select public.agri_command('sales_analytics',pg_temp.request())$$,'42501',null,'Other organization denied');
reset role;
delete from auth.sessions where id=pg_temp.i(2);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(2),'session_id',pg_temp.i(2))::text,true);
set local role authenticated;
insert into tap_results select throws_ok($$select app_private.sales_analytics(pg_temp.request())$$,'42501',null,'Direct helper call still checks revoked session');
reset role;
insert into tap_results select ok(not has_function_privilege('anon','app_private.sales_analytics(jsonb)','execute'),'Anonymous helper execution blocked');
insert into tap_results select is((select count(*) from public.sales),(select sales from before_counts),'Analytics does not change sales');
insert into tap_results select is((select count(*) from public.payments),(select payments from before_counts),'Analytics does not change cash');
insert into tap_results select is((select count(*) from public.inventory_movements),(select movements from before_counts),'Analytics does not change stock movements');
select * from finish();select line from tap_results;rollback;
