-- Cash refunds for selected original line quantities, with independent physical dispositions.
create table public.sale_partial_refunds (
 id uuid primary key,organization_id uuid not null,branch_id uuid not null,sale_id uuid not null,shift_id uuid not null,
 amount bigint not null check(amount>=0),reference text not null check(length(reference) between 3 and 200),
 reason text not null check(length(reason) between 3 and 1000),created_by uuid not null references auth.users,created_at timestamptz not null,
 unique(organization_id,id),foreign key(organization_id,sale_id) references public.sales(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),foreign key(organization_id,shift_id) references public.cashier_shifts(organization_id,id)
);
create index partial_refunds_sale on public.sale_partial_refunds(organization_id,sale_id,created_at,id);
create index partial_refunds_branch on public.sale_partial_refunds(organization_id,branch_id,created_at,id);
create index partial_refunds_shift on public.sale_partial_refunds(organization_id,shift_id);
create index partial_refunds_actor on public.sale_partial_refunds(created_by);
alter table public.sale_partial_refunds enable row level security;
revoke all on public.sale_partial_refunds from public,anon,authenticated;
grant select on public.sale_partial_refunds to authenticated;
create policy branch_read on public.sale_partial_refunds for select to authenticated using(app_private.can_access(organization_id,branch_id));
create trigger immutable_history before update or delete on public.sale_partial_refunds for each row execute function app_private.immutable();
create table app_private.partial_refund_lines (
 organization_id uuid not null,refund_id uuid not null,line_index integer not null check(line_index between 0 and 99),
 quantity numeric(20,6) not null check(quantity>0),returned numeric(20,6) not null check(returned>=0 and returned<=quantity),
 saleable numeric(20,6) not null check(saleable>=0 and saleable<=returned),held numeric(20,6) not null check(held>=0 and held+saleable=returned),
 amount bigint not null check(amount>=0),primary key(organization_id,refund_id,line_index),
 foreign key(organization_id,refund_id) references public.sale_partial_refunds(organization_id,id)
);
alter table app_private.partial_refund_lines enable row level security;
revoke all on app_private.partial_refund_lines from public,anon,authenticated;
create trigger immutable_history before update or delete on app_private.partial_refund_lines for each row execute function app_private.immutable();
alter table public.payments add column partial_refund_id uuid references public.sale_partial_refunds(id);
create unique index partial_refund_payment_once on public.payments(partial_refund_id) where partial_refund_id is not null;
alter table public.payments add constraint one_refund_source check(reversal_id is null or partial_refund_id is null);

create function app_private.partial_refund_plan(org uuid,branch uuid,saleid uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare s public.sales;v_full boolean;v_lines jsonb;v_paid bigint;v_version integer;
begin
 select * into s from public.sales where organization_id=org and branch_id=branch and id=saleid;
 if s.id is null then raise exception 'Sale not found';end if;
 select exists(select 1 from public.sale_reversals where organization_id=org and sale_id=saleid) into v_full;
 select count(*)::integer,coalesce(sum(amount),0)::bigint into v_version,v_paid from public.sale_partial_refunds where organization_id=org and sale_id=saleid;
 if v_full then v_paid:=s.total;v_version:=v_version+1;end if;
 select jsonb_agg(i.item||jsonb_build_object('lineIndex',i.n-1,'baseUnit',p.base_unit,'saleableAllowed',not exists(select 1 from public.product_batches b where b.id=(i.item->>'batchId')::uuid and b.expires_on<(now() at time zone 'Asia/Manila')::date),
  'refundedQuantity',trim_scale(case when v_full then (i.item->>'quantity')::numeric else coalesce(r.quantity,0) end)::text,
  'remainingQuantity',trim_scale(case when v_full then 0 else (i.item->>'quantity')::numeric-coalesce(r.quantity,0) end)::text,
  'refundedAmount',case when v_full then (i.item->>'lineTotal')::bigint else coalesce(r.amount,0)::bigint end) order by i.n) into v_lines
 from jsonb_array_elements(s.payload->'items') with ordinality i(item,n) join public.products p on p.organization_id=org and p.id=(i.item->>'productId')::uuid
 left join lateral(select sum(l.quantity) quantity,sum(l.amount) amount from app_private.partial_refund_lines l join public.sale_partial_refunds h on h.organization_id=l.organization_id and h.id=l.refund_id where h.organization_id=org and h.sale_id=saleid and l.line_index=i.n-1)r on true;
 return jsonb_build_object('saleId',s.id,'receipt',s.receipt,'version',v_version,'total',s.total,'refundedCash',v_paid,'remainingCash',s.total-v_paid,'fullyRefunded',v_full or not exists(select 1 from jsonb_array_elements(v_lines)l where (l->>'remainingQuantity')::numeric>0),'lines',v_lines);
end$$;
revoke all on function app_private.partial_refund_plan(uuid,uuid,uuid) from public,anon,authenticated;

create function app_private.partial_refund_quote(plan jsonb,items jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare r jsonb;l jsonb;v_rows jsonb:='[]'::jsonb;q numeric;t numeric;a numeric;h numeric;f numeric;v_amount bigint;v_total bigint:=0;d text;
begin
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 100 then raise exception 'Select at least one original sale line';end if;
 if (select count(distinct e->>'lineIndex') from jsonb_array_elements(items)e)<>jsonb_array_length(items) then raise exception 'Each original line can appear only once';end if;
 for r in select value from jsonb_array_elements(items) loop
  select value into l from jsonb_array_elements(plan->'lines') where value->>'lineIndex'=r->>'lineIndex';
  if l is null then raise exception 'Select an original sale line';end if;
  if coalesce(r->>'quantity','')!~'^\d{1,14}(\.\d{1,6})?$' or coalesce(r->>'returnedQuantity','')!~'^\d{1,14}(\.\d{1,6})?$' then raise exception 'Use exact nonnegative quantities with at most six decimal places';end if;
  q:=(r->>'quantity')::numeric;t:=(r->>'returnedQuantity')::numeric;f:=(l->>'factor')::numeric;d:=r->>'disposition';
  if q<=0 or q>(l->>'remainingQuantity')::numeric or t>q or scale(trim_scale(q*f))>6 or scale(trim_scale(t*f))>6 then raise exception 'Refund and returned quantities must stay within the original unrefunded quantity';end if;
  if d is null or d not in ('resalable','hold','mixed','not_returned') or (t=0 and d<>'not_returned') or (t>0 and d='not_returned') then raise exception 'Choose the physical disposition; use no goods returned only with zero returned quantity';end if;
  if d='mixed' and coalesce(r->>'resalableQuantity','')!~'^\d{1,14}(\.\d{1,6})?$' then raise exception 'Record the inspected saleable portion of the physical return';end if;
  a:=case when d='resalable' then t when d='mixed' then (r->>'resalableQuantity')::numeric else 0 end;h:=t-a;
  if a<0 or a>t or scale(trim_scale(a*f))>6 or scale(trim_scale(h*f))>6 then raise exception 'Saleable and held portions must equal the physical returned quantity';end if;
  if l->>'baseUnit'='piece' and (q*f<>trunc(q*f) or a*f<>trunc(a*f) or h*f<>trunc(h*f)) then raise exception 'Piece stock must be a whole number';end if;
  if a>0 and exists(select 1 from public.product_batches b where b.id=(l->>'batchId')::uuid and b.expires_on<(now() at time zone 'Asia/Manila')::date) then raise exception 'Expired returns must be held, not restored to saleable stock';end if;
  -- Cumulative rounding assigns the last centavo exactly once across many refunds.
  v_amount:=round((l->>'lineTotal')::numeric*((l->>'refundedQuantity')::numeric+q)/(l->>'quantity')::numeric)::bigint-(l->>'refundedAmount')::bigint;
  if v_amount<0 then raise exception 'Refund allocation is inconsistent; preserve the source and ask the owner to reconcile';end if;
  v_total:=v_total+v_amount;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('lineIndex',(r->>'lineIndex')::integer,'productId',l->'productId','batchId',l->'batchId','factor',f::text,'baseUnit',l->>'baseUnit','quantity',trim_scale(q)::text,'returnedQuantity',trim_scale(t)::text,'saleableQuantity',trim_scale(a)::text,'heldQuantity',trim_scale(h)::text,'amount',v_amount));
 end loop;
 if v_total>(plan->>'remainingCash')::bigint then raise exception 'Refund exceeds the original remaining cash amount';end if;
 return jsonb_build_object('amount',v_total,'items',v_rows);
end$$;
revoke all on function app_private.partial_refund_quote(jsonb,jsonb) from public,anon,authenticated;

alter function app_private.command(text,jsonb) rename to command_before_partial_refunds;
revoke all on function app_private.command_before_partial_refunds(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid();org uuid:=(data->>'organizationId')::uuid;branch uuid:=(data->>'branchId')::uuid;
 m public.staff_memberships;s public.sales;sh public.cashier_shifts;e public.stock_control_events;
 ident uuid;plan jsonb;quote jsonb;r jsonb;v_cash bigint;v_amount bigint;v_at timestamptz;v_rows jsonb;v_next jsonb;v_before timestamptz;v_before_id uuid;
begin
 if action not in ('partial_refund_plan','partial_refund_sale','partial_refund_history','refund_sale') then return app_private.command_before_partial_refunds(action,data);end if;
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.sessions a where a.id=(auth.jwt()->>'session_id')::uuid and a.user_id=uid and (a.not_after is null or a.not_after>now())) then raise exception 'Sign in again before issuing refunds' using errcode='42501';end if;
 select * into m from public.staff_memberships where organization_id=org and user_id=uid and active and (role='owner' or branch_id=branch) order by (role='owner') desc limit 1 for share;
 if m.id is null or branch is null or not exists(select 1 from public.branches where organization_id=org and id=branch) then raise exception 'You do not have access to this branch' using errcode='42501';end if;
 if m.role<>'owner' then raise exception 'Only the owner can authorize a refund' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||branch::text,1));
 select * into s from public.sales where organization_id=org and branch_id=branch and id=(data->>'saleId')::uuid for update;
 if s.id is null then raise exception 'Sale not found';end if;
 if action='partial_refund_plan' then return app_private.partial_refund_plan(org,branch,s.id);end if;
 if action='partial_refund_history' then
  if data->'before' is not null and data->'before'<>'null'::jsonb then v_before:=(data->'before'->>'at')::timestamptz;v_before_id:=(data->'before'->>'id')::uuid;if v_before is null or v_before_id is null then raise exception 'Invalid refund history cursor';end if;end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]') into v_rows from(select h.id,h.amount,h.reference,h.reason,h.created_at,h.created_by,
   (select jsonb_agg(jsonb_build_object('lineIndex',l.line_index,'quantity',trim_scale(l.quantity)::text,'returnedQuantity',trim_scale(l.returned)::text,'saleableQuantity',trim_scale(l.saleable)::text,'heldQuantity',trim_scale(l.held)::text,'amount',l.amount) order by l.line_index) from app_private.partial_refund_lines l where l.organization_id=org and l.refund_id=h.id) lines
   from public.sale_partial_refunds h where h.organization_id=org and h.sale_id=s.id and (v_before is null or (h.created_at,h.id)<(v_before,v_before_id)) order by h.created_at desc,h.id desc limit 31)x;
  if jsonb_array_length(v_rows)>30 then v_next:=jsonb_build_object('at',v_rows->29->>'created_at','id',v_rows->29->>'id');v_rows:=v_rows-30;end if;
  return jsonb_build_object('rows',v_rows,'next',v_next);
 end if;
 ident:=(data->>'refundId')::uuid;if ident is null then raise exception 'A permanent refund ID is required';end if;
 select * into e from public.stock_control_events where id=ident;
 if e.id is not null then
  if e.organization_id=org and e.branch_id=branch and e.source_id=s.id and e.action=action and e.actor_id=uid and e.payload=data then
   if action='refund_sale' then return app_private.command_before_partial_refunds(action,data);end if;
   return jsonb_build_object('id',ident,'amount',(select amount from public.sale_partial_refunds where id=ident),'duplicate',true);
  end if;
  raise exception 'Refund ID conflict';
 end if;
 if exists(select 1 from public.sale_reversals where organization_id=org and sale_id=s.id) then raise exception 'This sale has already been refunded';end if;
 if action='refund_sale' and exists(select 1 from public.sale_partial_refunds where organization_id=org and sale_id=s.id) then raise exception 'This sale has partial refunds. Refund only its remaining quantities';end if;
 select * into sh from public.cashier_shifts where organization_id=org and branch_id=branch and id=(data->>'shiftId')::uuid and cashier_id=uid and closed_at is null for update;
 if sh.id is null then raise exception 'Open your own shift before issuing a cash refund';end if;
 if action='partial_refund_sale' then
  if length(coalesce(btrim(data->>'reason'),'')) not between 3 and 1000 or length(coalesce(btrim(data->>'reference'),'')) not between 3 and 200 then raise exception 'Enter a refund reference and reason with at least three characters';end if;
  if not coalesce((data->>'physicalConfirmed')::boolean,false) then raise exception 'Confirm the cash refund and inspected physical return quantities';end if;
  plan:=app_private.partial_refund_plan(org,branch,s.id);
  if (data->>'expectedRefundVersion')::integer is distinct from (plan->>'version')::integer then raise exception 'This sale has a newer refund. Refresh its remaining quantities before confirming';end if;
  quote:=app_private.partial_refund_quote(plan,data->'items');v_amount:=(quote->>'amount')::bigint;
  if (data->>'expectedAmount')::bigint is distinct from v_amount then raise exception 'The refund amount changed. Review the original sale allocation again';end if;
 else v_amount:=s.total;end if;
 select sh.opening_cash+coalesce(sum(p.amount),0) into v_cash from public.payments p where p.organization_id=org and p.branch_id=branch and p.shift_id=sh.id;
 if v_amount>v_cash then raise exception 'Not enough recorded drawer cash. Check the actual float and cash records before refunding';end if;
 if action='refund_sale' then return app_private.command_before_partial_refunds(action,data);end if;
 v_at:=clock_timestamp();
 insert into public.sale_partial_refunds values(ident,org,branch,s.id,sh.id,v_amount,btrim(data->>'reference'),btrim(data->>'reason'),uid,v_at);
 for r in select value from jsonb_array_elements(quote->'items') loop
  insert into app_private.partial_refund_lines values(org,ident,(r->>'lineIndex')::integer,(r->>'quantity')::numeric,(r->>'returnedQuantity')::numeric,(r->>'saleableQuantity')::numeric,(r->>'heldQuantity')::numeric,(r->>'amount')::bigint);
  if (r->>'saleableQuantity')::numeric>0 then
   insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by,created_at) values(org,branch,(r->>'productId')::uuid,(r->>'batchId')::uuid,(r->>'saleableQuantity')::numeric*(r->>'factor')::numeric,'refund',ident,uid,v_at);
  end if;
  if (r->>'heldQuantity')::numeric>0 then insert into public.stock_holds(organization_id,branch_id,product_id,batch_id,quantity,remaining,reason,source_id,created_at) values(org,branch,(r->>'productId')::uuid,(r->>'batchId')::uuid,(r->>'heldQuantity')::numeric*(r->>'factor')::numeric,(r->>'heldQuantity')::numeric*(r->>'factor')::numeric,btrim(data->>'reason'),ident,v_at);end if;
  if (r->>'returnedQuantity')::numeric<>(r->>'quantity')::numeric or (r->>'heldQuantity')::numeric>0 then insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details,created_at) values(org,branch,'return_review',ident,jsonb_build_object('saleId',s.id,'reason',btrim(data->>'reason')),v_at) on conflict do nothing;end if;
 end loop;
 insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount,partial_refund_id,created_at) values(org,branch,s.id,sh.id,-v_amount,ident,v_at);
 insert into public.stock_control_events values(ident,org,branch,action,s.id,uid,data,v_at);
 insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details,created_at) values(org,branch,uid,action,ident,jsonb_build_object('saleId',s.id,'amount',v_amount,'reference',data->>'reference'),v_at);
 return jsonb_build_object('id',ident,'amount',v_amount,'duplicate',false);
end$$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
