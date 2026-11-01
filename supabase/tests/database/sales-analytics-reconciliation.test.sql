-- Independent financial/quantity oracle. All fixtures roll back; no hosted data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.i(n integer) returns uuid language sql immutable as $$select ('79100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email) values(pg_temp.i(1),'analytics-oracle@example.invalid');
insert into auth.sessions(id,user_id) values(pg_temp.i(1),pg_temp.i(1));
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.i(1),'session_id',pg_temp.i(1))::text,true);
set local role authenticated;
select public.agri_command('bootstrap','{"name":"TEST analytics reconciliation"}');
reset role;
create function pg_temp.org() returns uuid language sql stable as $$select organization_id from public.staff_memberships where user_id=pg_temp.i(1)$$;
create function pg_temp.branch() returns uuid language sql stable as $$select id from public.branches where organization_id=pg_temp.org() and code='B01'$$;
insert into public.devices(id,organization_id,branch_id,name,registered_by) values(pg_temp.i(2),pg_temp.org(),pg_temp.branch(),'TEST analytics oracle PC',pg_temp.i(1));
insert into public.cashier_shifts(id,organization_id,branch_id,device_id,cashier_id,opened_at,closed_at,opening_cash,expected_cash,counted_cash) values(pg_temp.i(3),pg_temp.org(),pg_temp.branch(),pg_temp.i(2),pg_temp.i(1),'2023-01-01Z','2025-01-01Z',0,0,0);
insert into public.products(id,organization_id,name,sku,base_unit)
 select pg_temp.i(10+n::integer),pg_temp.org(),'TEST oracle '||u,'ORACLE-'||n,u from unnest(array['kg','liter','meter','piece']) with ordinality t(u,n);
insert into public.product_units(id,organization_id,product_id,name,factor)
 select pg_temp.i(20+n),pg_temp.org(),pg_temp.i(10+n),'TEST base',1 from generate_series(1,4)n;
insert into public.product_units(id,organization_id,product_id,name,factor) values(pg_temp.i(31),pg_temp.org(),pg_temp.i(11),'TEST sack',50),(pg_temp.i(32),pg_temp.org(),pg_temp.i(12),'TEST drum',20),(pg_temp.i(33),pg_temp.org(),pg_temp.i(13),'TEST roll',100);
create temporary table fixture as
 select n,pg_temp.i(1000+n) id,pg_temp.i(11+n%4) product,pg_temp.i(21+n%4) unit,
  '2023-01-01 16:00:00Z'::timestamptz+(n/4)*interval '1 day'+(n%3)*interval '1 microsecond' occurred,
  case when n%4=3 then 1::numeric else (n%99+1)::numeric/1000 end quantity,
  case when n=1 then 9007199254740993::bigint else n*13::bigint end amount
 from generate_series(1,2800)n;
insert into public.sales(id,organization_id,branch_id,device_id,cashier_id,shift_id,occurred_at,received_at,total,cash_received,receipt,payload)
 select id,pg_temp.org(),pg_temp.branch(),pg_temp.i(2),pg_temp.i(1),pg_temp.i(3),occurred,occurred+interval '18 hours',amount,amount,'TEST oracle '||n,'{}' from fixture;
insert into public.sale_items(organization_id,sale_id,product_id,unit_id,quantity,factor,price,cost,line_total,price_version)
 select pg_temp.org(),id,product,unit,quantity,1,amount,0,amount,1 from fixture;
insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount,created_at)
 select pg_temp.org(),pg_temp.branch(),id,pg_temp.i(3),amount,occurred+interval '18 hours' from fixture;
-- Full reversals and later recovered cash are deliberately on different dates.
insert into public.sale_reversals(id,organization_id,branch_id,sale_id,shift_id,reason,created_by,created_at)
 select pg_temp.i(5000+n),pg_temp.org(),pg_temp.branch(),id,pg_temp.i(3),'TEST later full refund',pg_temp.i(1),occurred+interval '5 days' from fixture where n%17=0;
insert into public.payments(organization_id,branch_id,sale_id,shift_id,reversal_id,amount,created_at)
 select pg_temp.org(),pg_temp.branch(),s.sale_id,s.shift_id,s.id,-f.amount,s.created_at from public.sale_reversals s join fixture f on f.id=s.sale_id where s.organization_id=pg_temp.org();
insert into public.sale_refund_corrections(id,organization_id,branch_id,sale_id,shift_id,full_refund_id,amount,reference,reason,ledger_revision,created_by,created_at)
 select pg_temp.i(9000+f.n),pg_temp.org(),pg_temp.branch(),f.id,pg_temp.i(3),r.id,f.amount,'TEST cash recovered','TEST full mistaken refund recovered',0,pg_temp.i(1),r.created_at+interval '3 days' from fixture f join public.sale_reversals r on r.sale_id=f.id where f.n%34=0;
insert into public.payments(organization_id,branch_id,sale_id,shift_id,refund_correction_id,amount,created_at)
 select organization_id,branch_id,sale_id,shift_id,id,amount,created_at from public.sale_refund_corrections where organization_id=pg_temp.org();
-- Preserve real base conversions, including zero-price original sales.
insert into public.sales(id,organization_id,branch_id,device_id,cashier_id,shift_id,occurred_at,total,cash_received,receipt,payload)
 values(pg_temp.i(50),pg_temp.org(),pg_temp.branch(),pg_temp.i(2),pg_temp.i(1),pg_temp.i(3),'2024-02-29 15:59:59.999999Z',0,0,'TEST free measured goods','{}');
insert into public.sale_items(organization_id,sale_id,product_id,unit_id,quantity,factor,price,cost,line_total,price_version)
 values(pg_temp.org(),pg_temp.i(50),pg_temp.i(11),pg_temp.i(31),0.005,50,0,0,0,1),(pg_temp.org(),pg_temp.i(50),pg_temp.i(12),pg_temp.i(32),0.00125,20,0,0,0,1),(pg_temp.org(),pg_temp.i(50),pg_temp.i(13),pg_temp.i(33),0.00125,100,0,0,0,1);
create temporary table tap_results(line text);
do $$declare request jsonb;r jsonb;w jsonb;expected jsonb;start_at timestamptz;end_at timestamptz;v_asof timestamptz;wrong integer;label text;
begin
 for request in
  select jsonb_build_object('period','custom','fromDate',x.a,'throughDate',x.b,'interval',y.g)
   from (values('2023-01-01','2023-01-31'),('2023-12-31','2024-01-01'),('2024-02-29','2024-02-29'),('2024-02-27','2024-03-04'),('2024-01-01','2024-12-31'),('2025-01-01','2025-01-31'))x(a,b)
   cross join unnest(array['day','week','month'])y(g)
  union all select jsonb_build_object('period',x.p,'interval',y.g) from unnest(array['today','week','last_week','month','last_month','year'])x(p) cross join unnest(array['day','week','month'])y(g)
 loop
  r:=public.agri_command('sales_analytics',request||jsonb_build_object('organizationId',pg_temp.org(),'branchId',pg_temp.branch()));
  v_asof:=(r->>'asOf')::timestamptz;label:=request::text;
  -- Recalculate each window directly from immutable records, without joining
  -- sales to payments/items (which would multiply receipt/payment amounts).
  for w in select * from jsonb_array_elements(jsonb_build_array(jsonb_build_object('from',r->>'fromDate','through',r->>'throughDate','totals',r->'totals'),jsonb_build_object('from',r->>'previousFromDate','through',r->>'previousThroughDate','totals',r->'previous'))) loop
   start_at:=(w->>'from')::timestamp at time zone 'Asia/Manila';end_at:=((w->>'through')::date+1)::timestamp at time zone 'Asia/Manila';
   select jsonb_build_object('grossSales',coalesce(sum(s.total),0)::text,'salesCount',count(*),'averageSale',coalesce(round(avg(s.total)),0)::text) into expected from public.sales s where s.organization_id=pg_temp.org() and s.branch_id=pg_temp.branch() and s.occurred_at>=start_at and s.occurred_at<end_at and s.occurred_at<=v_asof and s.received_at<=v_asof;
   insert into tap_results select ok((w->'totals')@>expected,'Independent sale sum/count/average '||label||' '||(w->>'from'));
   select jsonb_build_object('refunds',coalesce(sum(-amount) filter(where amount<0),0)::text,'recoveries',coalesce(sum(amount) filter(where refund_correction_id is not null),0)::text) into expected from public.payments where organization_id=pg_temp.org() and branch_id=pg_temp.branch() and created_at>=start_at and created_at<end_at and created_at<=v_asof;
   insert into tap_results select ok((w->'totals')@>expected,'Independent refund/recovery dates '||label||' '||(w->>'from'));
  end loop;
  select jsonb_build_object('grossSales',sum((v->>'grossSales')::numeric)::text,'salesCount',sum((v->>'salesCount')::numeric),'refunds',sum((v->>'refunds')::numeric)::text,'recoveries',sum((v->>'recoveries')::numeric)::text,'netCash',sum((v->>'netCash')::numeric)::text) into expected from jsonb_array_elements(r->'trend')v;
  insert into tap_results select ok((r->'totals')@>expected,'Trend partition equals exact summary '||label);
  select count(*) into wrong from jsonb_array_elements(r->'trend')v where
   (v->>'grossSales')::numeric is distinct from (select coalesce(sum(s.total),0) from public.sales s where s.organization_id=pg_temp.org() and s.branch_id=pg_temp.branch() and s.occurred_at>=((v->>'date')::timestamp at time zone 'Asia/Manila') and s.occurred_at<(((v->>'throughDate')::date+1)::timestamp at time zone 'Asia/Manila') and s.occurred_at<=v_asof and s.received_at<=v_asof)
   or (v->>'salesCount')::bigint is distinct from (select count(*) from public.sales s where s.organization_id=pg_temp.org() and s.branch_id=pg_temp.branch() and s.occurred_at>=((v->>'date')::timestamp at time zone 'Asia/Manila') and s.occurred_at<(((v->>'throughDate')::date+1)::timestamp at time zone 'Asia/Manila') and s.occurred_at<=v_asof and s.received_at<=v_asof)
   or (v->>'refunds')::numeric is distinct from (select coalesce(sum(-amount),0) from public.payments p where p.organization_id=pg_temp.org() and p.branch_id=pg_temp.branch() and p.amount<0 and p.created_at>=((v->>'date')::timestamp at time zone 'Asia/Manila') and p.created_at<(((v->>'throughDate')::date+1)::timestamp at time zone 'Asia/Manila') and p.created_at<=v_asof)
   or (v->>'recoveries')::numeric is distinct from (select coalesce(sum(amount),0) from public.payments p where p.organization_id=pg_temp.org() and p.branch_id=pg_temp.branch() and p.refund_correction_id is not null and p.created_at>=((v->>'date')::timestamp at time zone 'Asia/Manila') and p.created_at<(((v->>'throughDate')::date+1)::timestamp at time zone 'Asia/Manila') and p.created_at<=v_asof)
   or (v->>'netCash')::numeric<>(v->>'grossSales')::numeric-(v->>'refunds')::numeric+(v->>'recoveries')::numeric;
  insert into tap_results select is(wrong,0,'Each individual trend bucket reconciles to the source dates '||label);
  start_at:=(r->>'fromDate')::timestamp at time zone 'Asia/Manila';end_at:=((r->>'throughDate')::date+1)::timestamp at time zone 'Asia/Manila';
  select count(*) into wrong from (
   (select i.product_id id,sum(i.quantity*i.factor) quantity,sum(i.line_total) gross,count(distinct s.id) purchases from public.sales s join public.sale_items i on i.organization_id=s.organization_id and i.sale_id=s.id where s.organization_id=pg_temp.org() and s.branch_id=pg_temp.branch() and s.occurred_at>=start_at and s.occurred_at<end_at and s.occurred_at<=v_asof and s.received_at<=v_asof group by i.product_id
    except select (v->>'id')::uuid,(v->>'quantity')::numeric,(v->>'grossSales')::numeric,(v->>'purchases')::bigint from jsonb_array_elements(r->'products')v)
   union all
   (select (v->>'id')::uuid,(v->>'quantity')::numeric,(v->>'grossSales')::numeric,(v->>'purchases')::bigint from jsonb_array_elements(r->'products')v
    except select i.product_id,sum(i.quantity*i.factor),sum(i.line_total),count(distinct s.id) from public.sales s join public.sale_items i on i.organization_id=s.organization_id and i.sale_id=s.id where s.organization_id=pg_temp.org() and s.branch_id=pg_temp.branch() and s.occurred_at>=start_at and s.occurred_at<end_at and s.occurred_at<=v_asof and s.received_at<=v_asof group by i.product_id)
  )differences;
  insert into tap_results select is(wrong,0,'Every product has exact original-unit quantities, money and frequency '||label);
  select count(*) into wrong from jsonb_array_elements(r->'products')v where (v->>'previousPurchases')::bigint is distinct from (select count(distinct s.id) from public.sales s join public.sale_items i on i.organization_id=s.organization_id and i.sale_id=s.id where s.organization_id=pg_temp.org() and s.branch_id=pg_temp.branch() and i.product_id=(v->>'id')::uuid and s.occurred_at>=((r->>'previousFromDate')::timestamp at time zone 'Asia/Manila') and s.occurred_at<(((r->>'previousThroughDate')::date+1)::timestamp at time zone 'Asia/Manila') and s.occurred_at<=v_asof and s.received_at<=v_asof);
  insert into tap_results select is(wrong,0,'Product comparison frequencies reconcile independently '||label);
 end loop;
end$$;
select * from finish();select line from tap_results;
rollback;
