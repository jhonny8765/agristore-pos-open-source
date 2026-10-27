-- Append-only undo of an untouched mistaken refund. Cash must be physically accounted for.
create table public.sale_refund_corrections (
 id uuid primary key,organization_id uuid not null,branch_id uuid not null,sale_id uuid not null,shift_id uuid not null,
 full_refund_id uuid references public.sale_reversals(id),partial_refund_id uuid references public.sale_partial_refunds(id),
 amount bigint not null check(amount>=0),reference text not null check(length(reference) between 3 and 200),
 reason text not null check(length(reason) between 10 and 1000),ledger_revision bigint not null,
 created_by uuid not null references auth.users,created_at timestamptz not null,
 check(num_nonnulls(full_refund_id,partial_refund_id)=1),unique(organization_id,id),
 foreign key(organization_id,sale_id) references public.sales(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,shift_id) references public.cashier_shifts(organization_id,id)
);
create unique index full_refund_corrected_once on public.sale_refund_corrections(full_refund_id) where full_refund_id is not null;
create unique index partial_refund_corrected_once on public.sale_refund_corrections(partial_refund_id) where partial_refund_id is not null;
create index refund_corrections_sale on public.sale_refund_corrections(organization_id,sale_id);
create index refund_corrections_branch on public.sale_refund_corrections(organization_id,branch_id,created_at,id);
create index refund_corrections_shift on public.sale_refund_corrections(organization_id,shift_id);
create index refund_corrections_actor on public.sale_refund_corrections(created_by);
alter table public.sale_refund_corrections enable row level security;
revoke all on public.sale_refund_corrections from public,anon,authenticated;
grant select on public.sale_refund_corrections to authenticated;
create policy branch_read on public.sale_refund_corrections for select to authenticated using(app_private.can_access(organization_id,branch_id));
create trigger immutable_history before update or delete on public.sale_refund_corrections for each row execute function app_private.immutable();
create table app_private.refund_correction_replacements (
 organization_id uuid not null,correction_id uuid not null,refund_id uuid not null,
 primary key(organization_id,correction_id),unique(organization_id,refund_id),
 foreign key(organization_id,correction_id) references public.sale_refund_corrections(organization_id,id),
 foreign key(organization_id,refund_id) references public.sale_partial_refunds(organization_id,id)
);
alter table app_private.refund_correction_replacements enable row level security;
revoke all on app_private.refund_correction_replacements from public,anon,authenticated;
create trigger immutable_history before update or delete on app_private.refund_correction_replacements for each row execute function app_private.immutable();
alter table public.payments add column refund_correction_id uuid references public.sale_refund_corrections(id);
create unique index refund_correction_payment_once on public.payments(refund_correction_id) where refund_correction_id is not null;
alter table public.payments add constraint correction_payment_source check(refund_correction_id is null or (reversal_id is null and partial_refund_id is null and amount>=0));
alter table public.inventory_movements drop constraint inventory_movements_kind_check;
alter table public.inventory_movements add constraint inventory_movements_kind_check check(kind in ('sale','refund','refund_correction','purchase','opening','transfer_out','transfer_in','adjustment','loss','hold_out','hold_release','purchase_reversal','hold_cancel'));
do $patch$declare d text:=pg_get_functiondef('app_private.stock_reconciliation(uuid,uuid,timestamptz,timestamptz,timestamptz)'::regprocedure);begin
 if strpos(d,$old$m.kind='refund'$old$)=0 then raise exception 'Refund reconciliation anchor missing';end if;
 execute replace(d,$old$m.kind='refund'$old$,$new$m.kind in ('refund','refund_correction')$new$);
end$patch$;

-- One representation of full and partial evidence, always taken from the original sale.
create function app_private.refund_source(org uuid,branch uuid,ident uuid,kind text) returns jsonb language plpgsql stable set search_path='' as $$
declare s public.sales;e public.stock_control_events;v_sale uuid;v_shift uuid;v_actor uuid;v_amount bigint;v_reference text;v_reason text;v_at timestamptz;v_complete boolean;v_lines jsonb:='[]'::jsonb;v_item jsonb;r jsonb;v_line record;t numeric;a numeric;h numeric;f numeric;i integer;
begin
 if kind='partial' then
  select x.sale_id,x.shift_id,x.created_by,x.amount,x.reference,x.reason,x.created_at into v_sale,v_shift,v_actor,v_amount,v_reference,v_reason,v_at from public.sale_partial_refunds x where x.organization_id=org and x.branch_id=branch and x.id=ident;
 elsif kind='full' then
  select x.sale_id,x.shift_id,x.created_by,sale.total,'Full refund '||x.id::text,x.reason,x.created_at into v_sale,v_shift,v_actor,v_amount,v_reference,v_reason,v_at from public.sale_reversals x join public.sales sale on sale.id=x.sale_id and sale.organization_id=x.organization_id where x.organization_id=org and x.branch_id=branch and x.id=ident;
 else raise exception 'Choose a full or partial original refund';end if;
 if v_sale is null then raise exception 'Refund not found in this branch';end if;
 select * into s from public.sales where organization_id=org and branch_id=branch and id=v_sale;
 select * into e from public.stock_control_events where id=ident and organization_id=org and branch_id=branch and source_id=v_sale and actor_id=v_actor and action=case when kind='full' then 'refund_sale' else 'partial_refund_sale' end;
 v_complete:=e.id is not null;
 if kind='partial' then
  for v_line in select l.* from app_private.partial_refund_lines l where l.organization_id=org and l.refund_id=ident order by l.line_index loop
   v_item:=s.payload->'items'->v_line.line_index;
   if v_item is null then v_complete:=false;end if;
   v_lines:=v_lines||jsonb_build_array(v_item||jsonb_build_object('lineIndex',v_line.line_index,'quantity',trim_scale(v_line.quantity)::text,'returnedQuantity',trim_scale(v_line.returned)::text,'saleableQuantity',trim_scale(v_line.saleable)::text,'heldQuantity',trim_scale(v_line.held)::text,'amount',v_line.amount));
  end loop;
  if jsonb_array_length(v_lines)=0 then v_complete:=false;end if;
 else
  v_complete:=v_complete and jsonb_typeof(e.payload->'returns')='array' and jsonb_array_length(e.payload->'returns')=jsonb_array_length(s.payload->'items');
  for i in 0..jsonb_array_length(s.payload->'items')-1 loop
   v_item:=s.payload->'items'->i;t:=null;a:=null;h:=null;f:=(v_item->>'factor')::numeric;
   if coalesce(v_complete,false) then
    select value into r from jsonb_array_elements(e.payload->'returns') where value->>'lineIndex'=i::text;
    if r is null or (select count(*) from jsonb_array_elements(e.payload->'returns') x where x->>'lineIndex'=i::text)<>1 or coalesce(r->>'quantity','')!~'^\d{1,14}(\.\d{1,6})?$' then v_complete:=false;
    else
     t:=(r->>'quantity')::numeric;
     if r->>'disposition'='resalable' then a:=t;h:=0;
     elsif r->>'disposition'='hold' then a:=0;h:=t;
     elsif r->>'disposition'='not_returned' and t=0 then a:=0;h:=0;
     elsif r->>'disposition'='mixed' and coalesce(r->>'resalableQuantity','')~'^\d{1,14}(\.\d{1,6})?$' then a:=(r->>'resalableQuantity')::numeric;h:=t-a;
     else v_complete:=false;end if;
     if a is null or h is null or t>(v_item->>'quantity')::numeric or a<0 or h<0 or scale(trim_scale(a*f))>6 or scale(trim_scale(h*f))>6 then v_complete:=false;end if;
    end if;
   end if;
   v_lines:=v_lines||jsonb_build_array(v_item||jsonb_build_object('lineIndex',i,'returnedQuantity',trim_scale(t)::text,'saleableQuantity',trim_scale(a)::text,'heldQuantity',trim_scale(h)::text,'amount',v_item->'lineTotal'));
  end loop;
 end if;
 return jsonb_build_object('id',ident,'kind',kind,'saleId',v_sale,'shiftId',v_shift,'created_by',v_actor,'created_at',v_at,'reference',v_reference,'reason',v_reason,'amount',v_amount,'evidenceComplete',coalesce(v_complete,false),'lines',v_lines,
 'correction',(select jsonb_build_object('id',c.id,'reference',c.reference,'reason',c.reason,'created_at',c.created_at,'amount',c.amount,'replacementId',(select l.refund_id from app_private.refund_correction_replacements l where l.organization_id=org and l.correction_id=c.id)) from public.sale_refund_corrections c where c.organization_id=org and ((kind='full' and c.full_refund_id=ident) or (kind='partial' and c.partial_refund_id=ident))),
 'correctsCorrectionId',(select l.correction_id from app_private.refund_correction_replacements l where l.organization_id=org and l.refund_id=ident and kind='partial'));
end$$;
revoke all on function app_private.refund_source(uuid,uuid,uuid,text) from public,anon,authenticated;

create or replace function app_private.partial_refund_plan(org uuid,branch uuid,saleid uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare s public.sales;v_full boolean;v_lines jsonb;v_paid bigint;v_version integer;v_corrections integer;
begin
 select * into s from public.sales where organization_id=org and branch_id=branch and id=saleid;
 if s.id is null then raise exception 'Sale not found';end if;
 select exists(select 1 from public.sale_reversals r where r.organization_id=org and r.sale_id=saleid and not exists(select 1 from public.sale_refund_corrections c where c.full_refund_id=r.id)) into v_full;
 select count(*)::integer,coalesce(sum(h.amount) filter(where not exists(select 1 from public.sale_refund_corrections c where c.partial_refund_id=h.id)),0)::bigint into v_version,v_paid from public.sale_partial_refunds h where h.organization_id=org and h.sale_id=saleid;
 select count(*)::integer into v_corrections from public.sale_refund_corrections where organization_id=org and sale_id=saleid;
 v_version:=v_version+v_corrections+(select count(*)::integer from public.sale_reversals where organization_id=org and sale_id=saleid);
 if v_full then v_paid:=v_paid+s.total;end if;
 select jsonb_agg(i.item||jsonb_build_object('lineIndex',i.n-1,'baseUnit',p.base_unit,'saleableAllowed',not exists(select 1 from public.product_batches b where b.id=(i.item->>'batchId')::uuid and b.expires_on<(now() at time zone 'Asia/Manila')::date),
  'refundedQuantity',trim_scale(case when v_full then (i.item->>'quantity')::numeric else coalesce(r.quantity,0) end)::text,
  'remainingQuantity',trim_scale(case when v_full then 0 else (i.item->>'quantity')::numeric-coalesce(r.quantity,0) end)::text,
  'refundedAmount',case when v_full then (i.item->>'lineTotal')::bigint else coalesce(r.amount,0)::bigint end) order by i.n) into v_lines
 from jsonb_array_elements(s.payload->'items') with ordinality i(item,n) join public.products p on p.organization_id=org and p.id=(i.item->>'productId')::uuid
 left join lateral(select sum(l.quantity) quantity,sum(l.amount) amount from app_private.partial_refund_lines l join public.sale_partial_refunds h on h.organization_id=l.organization_id and h.id=l.refund_id where h.organization_id=org and h.sale_id=saleid and l.line_index=i.n-1 and not exists(select 1 from public.sale_refund_corrections c where c.partial_refund_id=h.id))r on true;
 return jsonb_build_object('saleId',s.id,'receipt',s.receipt,'version',v_version,'total',s.total,'refundedCash',v_paid,'remainingCash',s.total-v_paid,'fullyRefunded',v_full or not exists(select 1 from jsonb_array_elements(v_lines)l where (l->>'remainingQuantity')::numeric>0),'lines',v_lines,'correctionCount',v_corrections);
end$$;

create function app_private.refund_correction_plan(org uuid,branch uuid,ident uuid,kind text,allowed_shift uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare src jsonb;reasons text[]:=array[]::text[];revision bigint;last_move bigint;expected jsonb;actual jsonb;effects jsonb:='[]'::jsonb;n integer;v_sale uuid;state jsonb;
begin
 src:=app_private.refund_source(org,branch,ident,kind);v_sale:=(src->>'saleId')::uuid;
 state:=app_private.partial_refund_plan(org,branch,v_sale);
 select coalesce(max(id),0) into revision from public.inventory_movements where organization_id=org and branch_id=branch;
 if src->'correction'<>'null'::jsonb then reasons:=array_append(reasons,'This refund is already corrected. Its original evidence remains retained.');end if;
 if not (src->>'evidenceComplete')::boolean then reasons:=array_append(reasons,'Complete original physical-return evidence is unavailable. Preserve the legacy refund and use owner reconciliation.');end if;
 if exists(select 1 from public.cashier_shifts where organization_id=org and branch_id=branch and closed_at is null and id is distinct from allowed_shift) then reasons:=array_append(reasons,'Close and synchronize every other branch cashier shift before correcting a refund.');end if;
 if exists(select 1 from (
  select r.id,r.created_at from public.sale_reversals r where r.organization_id=org and r.sale_id=v_sale and not exists(select 1 from public.sale_refund_corrections c where c.full_refund_id=r.id)
  union all select r.id,r.created_at from public.sale_partial_refunds r where r.organization_id=org and r.sale_id=v_sale and not exists(select 1 from public.sale_refund_corrections c where c.partial_refund_id=r.id)
 )r where (r.created_at,r.id)>((src->>'created_at')::timestamptz,ident)) then reasons:=array_append(reasons,'A later active refund exists on this receipt. Correct the latest refund first to preserve centavo allocation.');end if;
 if exists(select 1 from public.stock_exceptions e where e.organization_id=org and e.branch_id=branch and e.source_id=ident and (e.state<>'open' or e.follow_up_version>0)) then reasons:=array_append(reasons,'Return investigation activity exists. Reconcile its evidence with the owner.');end if;
 if (select count(*) from public.payments p where p.organization_id=org and p.branch_id=branch and p.sale_id=v_sale and p.shift_id=(src->>'shiftId')::uuid and p.amount=-(src->>'amount')::bigint and ((kind='full' and p.reversal_id=ident) or (kind='partial' and p.partial_refund_id=ident)))<>1 then reasons:=array_append(reasons,'The original cash payment does not match this refund. Use owner reconciliation.');end if;
 if (src->>'evidenceComplete')::boolean then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]') into expected from(select (l->>'productId')::uuid product_id,(l->>'batchId')::uuid batch_id,sum((l->>'saleableQuantity')::numeric*(l->>'factor')::numeric) quantity from jsonb_array_elements(src->'lines')l where (l->>'saleableQuantity')::numeric>0 group by 1,2)x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]') into actual from(select m.product_id,m.batch_id,sum(m.quantity) quantity from public.inventory_movements m where m.organization_id=org and m.branch_id=branch and m.source_id=ident group by 1,2)x;
  select count(*)::integer into n from jsonb_array_elements(src->'lines')l where (l->>'saleableQuantity')::numeric>0;
  if expected<>actual or n<>(select count(*) from public.inventory_movements where organization_id=org and branch_id=branch and source_id=ident) or exists(select 1 from public.inventory_movements m where m.organization_id=org and m.branch_id=branch and m.source_id=ident and m.kind<>'refund') then reasons:=array_append(reasons,'Original saleable return movements do not match the refund. Use owner reconciliation.');end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]') into expected from(select (l->>'productId')::uuid product_id,(l->>'batchId')::uuid batch_id,sum((l->>'heldQuantity')::numeric*(l->>'factor')::numeric) quantity from jsonb_array_elements(src->'lines')l where (l->>'heldQuantity')::numeric>0 group by 1,2)x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]') into actual from(select h.product_id,h.batch_id,sum(h.quantity) quantity from public.stock_holds h where h.organization_id=org and h.branch_id=branch and h.source_id=ident group by 1,2)x;
  select count(*)::integer into n from jsonb_array_elements(src->'lines')l where (l->>'heldQuantity')::numeric>0;
  if expected<>actual or n<>(select count(*) from public.stock_holds where organization_id=org and branch_id=branch and source_id=ident) then reasons:=array_append(reasons,'Original held returns do not match the refund. Use owner reconciliation.');end if;
  if exists(select 1 from public.stock_holds h where h.organization_id=org and h.branch_id=branch and h.source_id=ident and (h.remaining<>h.quantity or exists(select 1 from public.stock_control_events e where e.organization_id=org and e.source_id=h.id and e.action='disposition_hold'))) then reasons:=array_append(reasons,'Returned held goods have already been processed. Use owner reconciliation.');end if;
  select max(id) into last_move from public.inventory_movements where organization_id=org and branch_id=branch and source_id=ident;
  if exists(select 1 from public.inventory_movements m join jsonb_array_elements(src->'lines')l on m.product_id=(l->>'productId')::uuid and m.batch_id is not distinct from (l->>'batchId')::uuid where m.organization_id=org and m.branch_id=branch and m.source_id<>ident and m.id>last_move and (l->>'saleableQuantity')::numeric>0) then reasons:=array_append(reasons,'Later stock movements exist for these saleable returns. Use owner reconciliation.');end if;
  if exists(select 1 from public.stock_counts c join jsonb_array_elements(src->'lines')l on c.product_id=(l->>'productId')::uuid and c.batch_id is not distinct from (l->>'batchId')::uuid where c.organization_id=org and c.branch_id=branch and c.state='approved' and c.ledger_revision>=last_move and (l->>'saleableQuantity')::numeric>0) then reasons:=array_append(reasons,'These saleable returns have a later approved physical count. Use owner reconciliation.');end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]') into effects from(select (l->>'productId')::uuid product_id,(l->>'batchId')::uuid batch_id,max(l->>'name') product_name,max(p.base_unit) base_unit,sum((l->>'saleableQuantity')::numeric*(l->>'factor')::numeric)::text saleable_to_remove,sum((l->>'heldQuantity')::numeric*(l->>'factor')::numeric)::text held_to_cancel,coalesce(i.quantity,0)::text book_before,(coalesce(i.quantity,0)-sum((l->>'saleableQuantity')::numeric*(l->>'factor')::numeric))::text book_after from jsonb_array_elements(src->'lines')l join public.products p on p.id=(l->>'productId')::uuid and p.organization_id=org left join public.branch_inventory i on i.organization_id=org and i.branch_id=branch and i.product_id=p.id and i.batch_id is not distinct from (l->>'batchId')::uuid group by (l->>'productId')::uuid,(l->>'batchId')::uuid,i.quantity)x;
  if exists(select 1 from jsonb_array_elements(effects)e where (e->>'book_after')::numeric<0) then reasons:=array_append(reasons,'Not enough saleable stock remains to undo the original return.');end if;
 end if;
 return jsonb_build_object('refundId',ident,'refundKind',kind,'saleId',v_sale,'eligible',cardinality(reasons)=0,'reasons',to_jsonb(reasons),'ledgerRevision',revision::text,'refundVersion',state->'version','cashToRestore',src->'amount','effects',effects);
end$$;
revoke all on function app_private.refund_correction_plan(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;

alter function app_private.command(text,jsonb) rename to command_before_refund_corrections;
revoke all on function app_private.command_before_refund_corrections(text,jsonb) from public,anon,authenticated;
do $patch$declare d text:=pg_get_functiondef('app_private.command_before_refund_corrections(text,jsonb)'::regprocedure);a text:=$old$exists(select 1 from public.sale_reversals where organization_id=org and sale_id=s.id)$old$;begin
 if strpos(d,a)=0 then raise exception 'Active full-refund guard anchor missing';end if;
 execute replace(d,a,$new$exists(select 1 from public.sale_reversals r where r.organization_id=org and r.sale_id=s.id and not exists(select 1 from public.sale_refund_corrections c where c.full_refund_id=r.id))$new$);
end$patch$;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid();org uuid:=(data->>'organizationId')::uuid;branch uuid:=(data->>'branchId')::uuid;
 m public.staff_memberships;s public.sales;sh public.cashier_shifts;e public.stock_control_events;
 ident uuid;rid uuid;kind text;src jsonb;plan jsonb;result jsonb;v_at timestamptz;v_allowed uuid;h record;mv record;v_rows jsonb;v_next jsonb;v_before timestamptz;v_before_id uuid;v_before_kind text;v_link uuid;
begin
 if action not in ('refund_correction_check','correct_refund','partial_refund_history','partial_refund_sale','refund_sale','dashboard') then return app_private.command_before_refund_corrections(action,data);end if;
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.sessions a where a.id=(auth.jwt()->>'session_id')::uuid and a.user_id=uid and (a.not_after is null or a.not_after>now())) then raise exception 'Sign in again before making online changes' using errcode='42501';end if;
 select * into m from public.staff_memberships where organization_id=org and user_id=uid and active and (role='owner' or branch_id=branch) order by (role='owner') desc limit 1 for share;
 if m.id is null or branch is null or not exists(select 1 from public.branches where organization_id=org and id=branch) then raise exception 'You do not have access to this branch' using errcode='42501';end if;
 if action='dashboard' then
  result:=app_private.command_before_refund_corrections(action,data);
  return result||jsonb_build_object('refundRecoveries',(select coalesce(sum(p.amount),0) from public.payments p where p.organization_id=org and p.refund_correction_id is not null and (m.role='owner' or p.branch_id=branch)),
   'netRefunds',(select -coalesce(sum(p.amount),0) from public.payments p where p.organization_id=org and (p.amount<0 or p.refund_correction_id is not null) and (m.role='owner' or p.branch_id=branch)));
 end if;
 if m.role<>'owner' then raise exception 'Only the owner can authorize a refund' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||branch::text,1));
 if action in ('refund_correction_check','correct_refund') then
  rid:=(data->>'refundId')::uuid;kind:=data->>'refundKind';src:=app_private.refund_source(org,branch,rid,kind);
  if (data->>'saleId')::uuid is distinct from (src->>'saleId')::uuid then raise exception 'Select the refund from its original receipt';end if;
  select * into s from public.sales where organization_id=org and id=(src->>'saleId')::uuid for update;
  if action='correct_refund' then
   ident:=(data->>'correctionId')::uuid;if ident is null then raise exception 'A permanent refund correction ID is required';end if;
   select * into e from public.stock_control_events where id=ident;
   if e.id is not null then
    if e.action=action and e.organization_id=org and e.branch_id=branch and e.source_id=rid and e.actor_id=uid and e.payload=data then return jsonb_build_object('id',ident,'duplicate',true);end if;
    raise exception 'Refund correction ID conflict';
   end if;
  end if;
  select * into sh from public.cashier_shifts where organization_id=org and branch_id=branch and id=(data->>'shiftId')::uuid and cashier_id=uid and closed_at is null for update;
  v_allowed:=sh.id;
  plan:=app_private.refund_correction_plan(org,branch,rid,kind,v_allowed);
  if action='refund_correction_check' then return plan;end if;
  if sh.id is null then raise exception 'Open your own shift before recording recovered refund cash';end if;
  if not (plan->>'eligible')::boolean then raise exception '%',plan->'reasons'->>0;end if;
  if data->>'expectedLedgerRevision' is distinct from plan->>'ledgerRevision' or (data->>'expectedRefundVersion')::integer is distinct from (plan->>'refundVersion')::integer then raise exception 'Stock or refund history changed after the correction check. Check it again before confirming';end if;
  if (data->>'cashRestoredCentavos')::bigint is distinct from (plan->>'cashToRestore')::bigint then raise exception 'Account for the full original refund amount before using automatic correction';end if;
  if length(coalesce(btrim(data->>'reason'),'')) not between 10 and 1000 or length(coalesce(btrim(data->>'reference'),'')) not between 3 and 200 then raise exception 'Record a correction reference and at least ten characters of owner evidence';end if;
  if not coalesce((data->>'cashConfirmed')::boolean,false) or not coalesce((data->>'goodsConfirmed')::boolean,false) or not coalesce((data->>'queuesConfirmed')::boolean,false) then raise exception 'Confirm full cash recovery, actual goods and every branch cashier PC';end if;
  perform 1 from public.branch_inventory i join jsonb_array_elements(src->'lines')l on i.product_id=(l->>'productId')::uuid and i.batch_id is not distinct from (l->>'batchId')::uuid where i.organization_id=org and i.branch_id=branch for update of i;
  plan:=app_private.refund_correction_plan(org,branch,rid,kind,v_allowed);
  if not (plan->>'eligible')::boolean then raise exception '%',plan->'reasons'->>0;end if;
  if data->>'expectedLedgerRevision' is distinct from plan->>'ledgerRevision' or (data->>'expectedRefundVersion')::integer is distinct from (plan->>'refundVersion')::integer then raise exception 'Stock or refund history changed after the correction check. Check it again before confirming';end if;
  v_at:=clock_timestamp();
  insert into public.sale_refund_corrections(id,organization_id,branch_id,sale_id,shift_id,full_refund_id,partial_refund_id,amount,reference,reason,ledger_revision,created_by,created_at) values(ident,org,branch,s.id,sh.id,case when kind='full' then rid end,case when kind='partial' then rid end,(src->>'amount')::bigint,btrim(data->>'reference'),btrim(data->>'reason'),(plan->>'ledgerRevision')::bigint,uid,v_at);
  for mv in select * from public.inventory_movements where organization_id=org and branch_id=branch and source_id=rid order by id loop
   insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by,reversal_of,created_at) values(org,branch,mv.product_id,mv.batch_id,-mv.quantity,'refund_correction',ident,uid,mv.id,v_at);
  end loop;
  for h in select * from public.stock_holds where organization_id=org and branch_id=branch and source_id=rid loop
   update public.stock_holds set remaining=0 where id=h.id;
   insert into public.stock_control_events values(gen_random_uuid(),org,branch,'disposition_hold',h.id,uid,jsonb_build_object('quantity',h.quantity::text,'disposition','refund_correction','correctionId',ident,'reason',btrim(data->>'reason')),v_at);
  end loop;
  update public.stock_exceptions ex set state='resolved',resolved_at=v_at,resolved_by=uid,resolution='Administrative correction of mistaken refund '||ident::text||': '||btrim(data->>'reason') where ex.organization_id=org and ex.branch_id=branch and ex.source_id=rid and ex.kind='return_review';
  insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount,refund_correction_id,created_at) values(org,branch,s.id,sh.id,(src->>'amount')::bigint,ident,v_at);
  insert into public.stock_control_events values(ident,org,branch,action,rid,uid,data,v_at);
  insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details,created_at) values(org,branch,uid,action,ident,jsonb_build_object('refundId',rid,'refundKind',kind,'saleId',s.id,'amount',src->'amount','reference',data->>'reference'),v_at);
  return jsonb_build_object('id',ident,'duplicate',false);
 end if;
 select * into s from public.sales where organization_id=org and branch_id=branch and id=(data->>'saleId')::uuid for update;
 if s.id is null then raise exception 'Sale not found';end if;
 if action='partial_refund_history' then
  if data->'before' is not null and data->'before'<>'null'::jsonb then v_before:=(data->'before'->>'at')::timestamptz;v_before_id:=(data->'before'->>'id')::uuid;v_before_kind:=data->'before'->>'kind';if v_before is null or v_before_id is null or v_before_kind not in ('full','partial') then raise exception 'Invalid refund history cursor';end if;end if;
  select coalesce(jsonb_agg(app_private.refund_source(org,branch,x.id,x.kind) order by x.created_at desc,x.id desc,x.kind desc),'[]') into v_rows from(
   select * from(select id,created_at,'full'::text kind from public.sale_reversals where organization_id=org and sale_id=s.id union all select id,created_at,'partial'::text kind from public.sale_partial_refunds where organization_id=org and sale_id=s.id)q where v_before is null or (q.created_at,q.id,q.kind)<(v_before,v_before_id,v_before_kind) order by q.created_at desc,q.id desc,q.kind desc limit 31)x;
  if jsonb_array_length(v_rows)>30 then v_next:=jsonb_build_object('at',v_rows->29->>'created_at','id',v_rows->29->>'id','kind',v_rows->29->>'kind');v_rows:=v_rows-30;end if;
  return jsonb_build_object('rows',v_rows,'next',v_next);
 end if;
 select * into e from public.stock_control_events where id=(data->>'refundId')::uuid;
 if e.id is not null then return app_private.command_before_refund_corrections(action,data);end if;
 if action='refund_sale' and exists(select 1 from public.sale_refund_corrections where organization_id=org and sale_id=s.id) then raise exception 'This receipt has a corrected refund. Use selected quantities for any new refund';end if;
 if action='partial_refund_sale' then
  v_link:=nullif(data->>'correctsCorrectionId','')::uuid;
  if v_link is not null then
   if not exists(select 1 from public.sale_refund_corrections where organization_id=org and branch_id=branch and sale_id=s.id and id=v_link) then raise exception 'Select the correction from this original receipt';end if;
   if exists(select 1 from app_private.refund_correction_replacements where organization_id=org and correction_id=v_link) then raise exception 'This refund correction already has a linked replacement';end if;
  end if;
  result:=app_private.command_before_refund_corrections(action,data);
  if v_link is not null then insert into app_private.refund_correction_replacements values(org,v_link,(data->>'refundId')::uuid);end if;
  return result;
 end if;
 return app_private.command_before_refund_corrections(action,data);
end$$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
