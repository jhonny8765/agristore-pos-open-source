-- Read-only, branch-scoped sales reporting. Money/quantities cross JSON as text.
create index payments_branch_created on public.payments(organization_id,branch_id,created_at);

create function app_private.sales_analytics(data jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid;
 today date:=(now() at time zone 'Asia/Manila')::date;
 period text:=coalesce(data->>'period','month'); grain text:=coalesce(data->>'interval','day');
 v_from date;v_to date;prev_from date;prev_to date;span integer;
 start_at timestamptz;end_at timestamptz;prior_at timestamptz;prior_end timestamptz;
 v_asof timestamptz:=statement_timestamp();result jsonb;
begin
 if org is null or branch is null or not app_private.can_access(org,branch)
 or not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=auth.uid() and m.active and (m.role='owner' or (m.role='manager' and m.branch_id=branch)))
 or not exists(select 1 from public.branches b where b.organization_id=org and b.id=branch and b.active) then
  raise exception 'Only an active owner or this branch manager can read sales analytics' using errcode='42501';
 end if;
 -- Active-branch/session/role checks above also protect direct helper calls.
 -- Do not call the command dispatcher's VOLATILE guard inside this STABLE read.
 if coalesce((data->>'allBranches')::boolean,false) then raise exception 'Select one branch for sales analytics';end if;
 if grain not in ('day','week','month') then raise exception 'Choose daily, weekly or monthly grouping';end if;
 if period='today' then v_from:=today;v_to:=today;prev_from:=today-1;prev_to:=today-1;
 elsif period in ('week','last_week') then
  v_from:=date_trunc('week',today::timestamp)::date;v_to:=today;
  if period='last_week' then v_to:=v_from-1;v_from:=v_from-7;end if;
  prev_from:=v_from-7;prev_to:=v_to-7;
 elsif period in ('month','last_month') then
  v_from:=date_trunc('month',today::timestamp)::date;v_to:=today;
  if period='last_month' then v_to:=v_from-1;v_from:=(v_from-interval '1 month')::date;end if;
  prev_from:=(v_from-interval '1 month')::date;
  prev_to:=case when period='last_month' then v_from-1 else least(v_from-1,prev_from+(extract(day from v_to)::integer-1)) end;
 elsif period='year' then
  v_from:=(date_trunc('month',today::timestamp)-interval '11 months')::date;v_to:=today;
  prev_from:=(v_from-interval '1 year')::date;prev_to:=(v_to-interval '1 year')::date;
 elsif period='custom' then
  if coalesce(data->>'fromDate','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(data->>'throughDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter both report dates';end if;
  v_from:=(data->>'fromDate')::date;v_to:=(data->>'throughDate')::date;
  if v_to<v_from or v_to-v_from>365 then raise exception 'Choose an ordered range of at most 366 days';end if;
  if v_to>today then raise exception 'Report dates cannot be in the future';end if;
  prev_to:=v_from-1;prev_from:=v_from-(v_to-v_from+1);
 else raise exception 'Choose a supported sales period';end if;
 span:=v_to-v_from+1;
 start_at:=v_from::timestamp at time zone 'Asia/Manila';end_at:=(v_to+1)::timestamp at time zone 'Asia/Manila';
 prior_at:=prev_from::timestamp at time zone 'Asia/Manila';prior_end:=(prev_to+1)::timestamp at time zone 'Asia/Manila';
 with
 scoped_sales as materialized (
  select s.* from public.sales s where s.organization_id=org and s.branch_id=branch and s.occurred_at>=prior_at and s.occurred_at<end_at and s.occurred_at<=v_asof and s.received_at<=v_asof
 ),
 scoped_payments as materialized (
  select p.* from public.payments p where p.organization_id=org and p.branch_id=branch and p.created_at>=prior_at and p.created_at<end_at and p.created_at<=v_asof and (p.amount<0 or p.refund_correction_id is not null)
 ),
 windows as (select false previous,start_at a,end_at b union all select true,prior_at,prior_end),
 summaries as (
  select w.previous,s.gross,s.n,p.refunds,p.recoveries,jsonb_build_object('grossSales',s.gross::text,'salesCount',s.n,'refunds',p.refunds::text,'recoveries',p.recoveries::text,'netCash',(s.gross-p.refunds+p.recoveries)::text,'averageSale',case when s.n=0 then '0' else round(s.gross/s.n)::text end) payload
  from windows w
  cross join lateral(select coalesce(sum(x.total),0) gross,count(*) n from scoped_sales x where x.occurred_at>=w.a and x.occurred_at<w.b)s
  cross join lateral(select coalesce(-sum(x.amount) filter(where x.amount<0),0) refunds,coalesce(sum(x.amount) filter(where x.refund_correction_id is not null),0) recoveries from scoped_payments x where x.created_at>=w.a and x.created_at<w.b)p
 ),
 buckets as (select x::date bucket from generate_series(date_trunc(grain,v_from::timestamp),date_trunc(grain,v_to::timestamp),('1 '||grain)::interval)x),
 sale_buckets as (select date_trunc(grain,s.occurred_at at time zone 'Asia/Manila')::date bucket,sum(s.total) gross,count(*) n from scoped_sales s where s.occurred_at>=start_at group by 1),
 payment_buckets as (select date_trunc(grain,p.created_at at time zone 'Asia/Manila')::date bucket,-coalesce(sum(p.amount) filter(where p.amount<0),0) refunds,coalesce(sum(p.amount) filter(where p.refund_correction_id is not null),0) recoveries from scoped_payments p where p.created_at>=start_at group by 1),
 product_sales as (
  select i.product_id,coalesce(sum(i.quantity*i.factor) filter(where s.occurred_at>=start_at),0) quantity,
   coalesce(sum(i.line_total) filter(where s.occurred_at>=start_at),0) gross,
   count(distinct s.id) filter(where s.occurred_at>=start_at) purchases,
   count(distinct s.id) filter(where s.occurred_at>=prior_at and s.occurred_at<prior_end) previous_purchases
  from scoped_sales s join public.sale_items i on i.organization_id=org and i.sale_id=s.id group by i.product_id
 ),
 products as (select p.id,p.name,p.sku,p.base_unit,trim_scale(s.quantity)::text quantity,s.gross::text "grossSales",s.purchases,s.previous_purchases "previousPurchases" from product_sales s join public.products p on p.organization_id=org and p.id=s.product_id where s.purchases>0),
 trend as (select greatest(b.bucket,v_from) date,least((b.bucket+('1 '||grain)::interval)::date-1,v_to) "throughDate",coalesce(s.gross,0)::text "grossSales",coalesce(s.n,0) "salesCount",coalesce(p.refunds,0)::text refunds,coalesce(p.recoveries,0)::text recoveries,(coalesce(s.gross,0)-coalesce(p.refunds,0)+coalesce(p.recoveries,0))::text "netCash" from buckets b left join sale_buckets s using(bucket) left join payment_buckets p using(bucket))
 select jsonb_build_object('version',1,'branchId',branch,'period',period,'interval',grain,'fromDate',v_from,'throughDate',v_to,'previousFromDate',prev_from,'previousThroughDate',prev_to,'days',span,'asOf',v_asof,
  'totals',(select payload from summaries where not previous),'previous',(select payload from summaries where previous),
  'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.date) from trend t),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.purchases desc,p."grossSales"::numeric desc,p.id) from products p),'[]'::jsonb),
  'lastSync',(select max(d.last_sync) from public.devices d where d.organization_id=org and d.branch_id=branch and d.active)) into result;
 return result;
end$$;
revoke all on function app_private.sales_analytics(jsonb) from public,anon;
grant execute on function app_private.sales_analytics(jsonb) to authenticated;

create or replace function public.agri_command(action text,data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 perform app_private.require_enabled_branch(action,data);
 if action='sales_analytics' then return app_private.sales_analytics(data);end if;
 if action in ('create_branch','rename_branch') then return app_private.branch_command(action,data);end if;
 result:=app_private.command(action,data);
 if action='dashboard' and exists(select 1 from public.branches b where b.organization_id=(data->>'organizationId')::uuid and b.id=(data->>'branchId')::uuid and b.active and b.management_locked) then return result||app_private.fixed_branch_dashboard((data->>'organizationId')::uuid,(data->>'branchId')::uuid);end if;
 return result;
end$$;
revoke all on function public.agri_command(text,jsonb) from public,anon;
grant execute on function public.agri_command(text,jsonb) to authenticated;
