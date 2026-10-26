-- Owner-only, full reversal of an untouched inspected delivery. Never rewrite its evidence.
create table app_private.delivery_reversals (
 id uuid primary key, organization_id uuid not null, branch_id uuid not null, inspection_id uuid not null unique,
 reference text not null check(length(reference) between 3 and 200), reason text not null check(length(reason) between 10 and 1000),
 ledger_revision bigint not null, reopened_order boolean not null, actor_id uuid not null references auth.users,
 created_at timestamptz not null default clock_timestamp(), payload jsonb not null,
 foreign key(organization_id,inspection_id) references app_private.delivery_inspections(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create index delivery_reversal_inspection on app_private.delivery_reversals(organization_id,inspection_id);
create index delivery_reversal_branch on app_private.delivery_reversals(organization_id,branch_id);
create index delivery_reversal_actor on app_private.delivery_reversals(actor_id);
alter table app_private.delivery_reversals enable row level security;
revoke all on app_private.delivery_reversals from public,anon,authenticated;
create trigger immutable_history before update or delete on app_private.delivery_reversals for each row execute function app_private.immutable();
alter table app_private.delivery_inspections add column corrects_inspection_id uuid;
alter table app_private.delivery_inspections add constraint corrected_inspection_fk foreign key(organization_id,corrects_inspection_id) references app_private.delivery_inspections(organization_id,id);
create unique index one_delivery_correction on app_private.delivery_inspections(corrects_inspection_id) where corrects_inspection_id is not null;
create index corrected_inspection_org on app_private.delivery_inspections(organization_id,corrects_inspection_id);
alter table public.inventory_movements add column reversal_of bigint references public.inventory_movements(id);
create unique index movement_reversal_once on public.inventory_movements(reversal_of) where reversal_of is not null;
create index movement_source_lookup on public.inventory_movements(organization_id,branch_id,source_id,id);
alter table public.inventory_movements drop constraint inventory_movements_kind_check;
alter table public.inventory_movements add constraint inventory_movements_kind_check check(kind in ('sale','refund','purchase','opening','transfer_out','transfer_in','adjustment','loss','hold_out','hold_release','purchase_reversal','hold_cancel'));

create or replace function app_private.order_line_balance(org uuid,line_id uuid)
returns table(accepted text,held text,rejected text,returned_or_disposed text,remaining text) language sql stable set search_path='' as $$
 select trim_scale(coalesce(sum(x.accepted*x.factor+coalesce(e.released,0)),0))::text,
 trim_scale(coalesce(sum(h.remaining),0))::text,trim_scale(coalesce(sum(x.rejected*x.factor),0))::text,trim_scale(coalesce(sum(e.removed),0))::text,
 trim_scale(l.base_quantity-coalesce(sum(x.accepted*x.factor+coalesce(e.released,0)+coalesce(h.remaining,0)),0))::text
 from app_private.purchase_order_lines l left join app_private.delivery_inspection_lines x on x.organization_id=org and x.order_line_id=l.id
 and not exists(select 1 from app_private.delivery_reversals r where r.organization_id=org and r.inspection_id=x.inspection_id)
 left join public.stock_holds h on h.id=x.hold_id and h.organization_id=org
 left join lateral(select sum((v.payload->>'quantity')::numeric) filter(where v.payload->>'disposition'='release') released,
 sum((v.payload->>'quantity')::numeric) filter(where v.payload->>'disposition' in ('dispose','supplier_return')) removed
 from public.stock_control_events v where v.organization_id=org and v.source_id=h.id and v.action='disposition_hold')e on true
 where l.organization_id=org and l.id=line_id group by l.base_quantity
$$;

-- Signed reversals belong to their original flow in quantity reconciliation, not to loss.
do $patch$declare d text:=pg_get_functiondef('app_private.stock_reconciliation(uuid,uuid,timestamptz,timestamptz,timestamptz)'::regprocedure);begin
 if strpos(d,$old$m.kind='purchase'$old$)=0 or strpos(d,$old$m.kind='hold_out'$old$)=0 then raise exception 'Reconciliation migration anchor missing';end if;
 d:=replace(d,$old$m.kind='purchase'$old$,$new$m.kind in ('purchase','purchase_reversal')$new$);
 d:=replace(d,$old$m.kind='hold_out'$old$,$new$m.kind in ('hold_out','hold_cancel')$new$);
 execute d;
end$patch$;

create function app_private.delivery_reversal_plan(v_org uuid,v_branch uuid,v_receipt uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare
 v_delivery app_private.delivery_inspections;v_reasons text[]:=array[]::text[];v_revision bigint;v_last bigint;
 v_state text;v_effects jsonb;v_expected jsonb;v_actual jsonb;v_count integer;
begin
 select * into v_delivery from app_private.delivery_inspections d where d.id=v_receipt and d.organization_id=v_org and d.branch_id=v_branch;
 if v_delivery.id is null then raise exception 'Inspected delivery not found in this branch';end if;
 select coalesce(max(m.id),0) into v_revision from public.inventory_movements m where m.organization_id=v_org and m.branch_id=v_branch;
 select max(m.id) into v_last from public.inventory_movements m where m.organization_id=v_org and m.branch_id=v_branch and m.source_id=v_receipt;
 if exists(select 1 from app_private.delivery_reversals r where r.inspection_id=v_receipt) then v_reasons:=array_append(v_reasons,'This delivery is already reversed. Its original evidence remains retained.');end if;
 if exists(select 1 from public.cashier_shifts s where s.organization_id=v_org and s.branch_id=v_branch and s.closed_at is null) then v_reasons:=array_append(v_reasons,'Close and synchronize every branch cashier shift before reversing a delivery.');end if;
 if exists(select 1 from app_private.supplier_claim_events e where e.organization_id=v_org and e.inspection_id=v_receipt)
 or exists(select 1 from public.stock_exceptions e where e.organization_id=v_org and e.branch_id=v_branch and e.source_id=v_receipt and (e.state<>'open' or e.follow_up_version>0)) then
  v_reasons:=array_append(v_reasons,'Supplier-claim or investigation activity exists. Reconcile its evidence with the owner instead of an automatic reversal.');end if;
 if exists(select 1 from app_private.delivery_inspection_lines l join public.stock_holds h on h.id=l.hold_id where l.inspection_id=v_receipt and (h.remaining<>l.held*l.factor or exists(select 1 from public.stock_control_events e where e.organization_id=v_org and e.source_id=h.id and e.action='disposition_hold'))) then
  v_reasons:=array_append(v_reasons,'Held goods have already been released, returned or disposed. Use owner reconciliation.');end if;
 if exists(select 1 from public.inventory_movements m join app_private.delivery_inspection_lines l on l.inspection_id=v_receipt and l.product_id=m.product_id and l.batch_id is not distinct from m.batch_id
 where m.organization_id=v_org and m.branch_id=v_branch and (l.accepted+l.held)>0 and m.source_id<>v_receipt and m.id>v_last) then
  v_reasons:=array_append(v_reasons,'Later stock movements exist for these goods. Sales, transfers, receipts or adjustments cannot be undone by this reversal.');end if;
 if exists(select 1 from public.stock_counts c join app_private.delivery_inspection_lines l on l.inspection_id=v_receipt and l.product_id=c.product_id and l.batch_id is not distinct from c.batch_id
 where c.organization_id=v_org and c.branch_id=v_branch and c.state='approved' and (l.accepted+l.held)>0 and c.ledger_revision>=v_last) then
  v_reasons:=array_append(v_reasons,'These goods have an approved physical count after receiving. Use a fresh owner reconciliation.');end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]'::jsonb) into v_expected from(
  select l.product_id,l.batch_id,sum((l.accepted+l.held)*l.factor) received,sum(-l.held*l.factor) held
  from app_private.delivery_inspection_lines l where l.inspection_id=v_receipt and l.accepted+l.held>0 group by l.product_id,l.batch_id)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]'::jsonb) into v_actual from(
  select m.product_id,m.batch_id,coalesce(sum(m.quantity) filter(where m.kind='purchase'),0) received,coalesce(sum(m.quantity) filter(where m.kind='hold_out'),0) held
  from public.inventory_movements m where m.organization_id=v_org and m.branch_id=v_branch and m.source_id=v_receipt group by m.product_id,m.batch_id)x;
 select coalesce(sum((case when l.accepted+l.held>0 then 1 else 0 end)+(case when l.held>0 then 1 else 0 end)),0)::integer into v_count from app_private.delivery_inspection_lines l where l.inspection_id=v_receipt;
 if v_expected<>v_actual or v_count<>(select count(*) from public.inventory_movements m where m.organization_id=v_org and m.branch_id=v_branch and m.source_id=v_receipt)
 or exists(select 1 from public.inventory_movements m where m.organization_id=v_org and m.branch_id=v_branch and m.source_id=v_receipt and m.kind not in ('purchase','hold_out')) then
  v_reasons:=array_append(v_reasons,'Original receiving movements do not match the inspection. Stop and ask the owner to reconcile the source records.');end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.product_id,coalesce(x.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]'::jsonb) into v_effects from(
  select l.product_id,l.batch_id,max(l.product_name) product_name,max(l.base_unit) base_unit,
  sum(l.accepted*l.factor)::text saleable_to_remove,sum(l.held*l.factor)::text held_to_cancel,
  coalesce(i.quantity,0)::text book_before,(coalesce(i.quantity,0)-sum(l.accepted*l.factor))::text book_after
  from app_private.delivery_inspection_lines l left join public.branch_inventory i on i.organization_id=v_org and i.branch_id=v_branch and i.product_id=l.product_id and i.batch_id is not distinct from l.batch_id
  where l.inspection_id=v_receipt group by l.product_id,l.batch_id,i.quantity)x;
 if exists(select 1 from jsonb_array_elements(v_effects)e where (e->>'book_after')::numeric<0) then v_reasons:=array_append(v_reasons,'There is not enough saleable book stock to undo this receipt safely.');end if;
 if v_delivery.order_id is not null then
  select e.action into v_state from app_private.purchase_order_events e where e.order_id=v_delivery.order_id order by e.revision desc limit 1;
  if v_state is null or v_state not in ('approve','close') then v_reasons:=array_append(v_reasons,'The linked purchase order is not in an approved or closed state.');end if;
 end if;
 return jsonb_build_object('receiptId',v_receipt,'eligible',cardinality(v_reasons)=0,'reasons',to_jsonb(v_reasons),'ledgerRevision',v_revision::text,'effects',v_effects,
 'orderId',v_delivery.order_id,'reopensOrder',coalesce(v_state='close' and exists(select 1 from app_private.delivery_inspection_lines l where l.inspection_id=v_receipt and l.accepted+l.held>0),false));
end$$;
revoke all on function app_private.delivery_reversal_plan(uuid,uuid,uuid) from public,anon,authenticated;

alter function app_private.command(text,jsonb) rename to command_before_delivery_reversals;
revoke all on function app_private.command_before_delivery_reversals(text,jsonb) from public,anon,authenticated;
-- Add correction lineage during the original INSERT, never by updating immutable evidence.
do $patch$declare d text:=pg_get_functiondef('app_private.command_before_delivery_reversals(text,jsonb)'::regprocedure);begin
 if strpos(d,$old$insert into app_private.delivery_inspections(id,organization_id,branch_id,supplier_id,order_id,reference,reason,created_by,payload) values(ident,org,branch,supplier,v_order_id,v_reference,note,uid,data);$old$)=0 then raise exception 'Inspection insert migration anchor missing';end if;
 execute replace(d,$old$insert into app_private.delivery_inspections(id,organization_id,branch_id,supplier_id,order_id,reference,reason,created_by,payload) values(ident,org,branch,supplier,v_order_id,v_reference,note,uid,data);$old$,
 $new$insert into app_private.delivery_inspections(id,organization_id,branch_id,supplier_id,order_id,reference,reason,created_by,payload,corrects_inspection_id) values(ident,org,branch,supplier,v_order_id,v_reference,note,uid,data,nullif(data->>'correctsInspectionId','')::uuid);$new$);
end$patch$;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();v_org uuid:=(data->>'organizationId')::uuid;v_branch uuid:=(data->>'branchId')::uuid;
 v_member public.staff_memberships;v_prior app_private.delivery_reversals;v_delivery app_private.delivery_inspections;v_line record;v_movement record;
 v_id uuid;v_receipt uuid;v_corrects uuid;v_result jsonb;v_plan jsonb;v_rows jsonb;v_revision integer;
 v_recorded_at timestamptz;v_reference text:=btrim(data->>'reference');v_reason text:=btrim(data->>'reason');v_reopen boolean;
begin
 if action not in ('delivery_reversal_check','reverse_delivery','purchasing_workspace','inspect_delivery','record_delivery_claim','disposition_hold') then return app_private.command_before_delivery_reversals(action,data);end if;
 if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=v_uid and (s.not_after is null or s.not_after>now())) then raise exception 'Sign in again before purchasing' using errcode='42501';end if;
 select * into v_member from public.staff_memberships m where m.organization_id=v_org and m.user_id=v_uid and m.active and (m.role='owner' or m.branch_id=v_branch) order by (m.role='owner') desc limit 1 for share;
 if v_member.id is null or v_branch is null or not exists(select 1 from public.branches b where b.organization_id=v_org and b.id=v_branch) then raise exception 'You do not have access to this branch' using errcode='42501';end if;
 if action='purchasing_workspace' then
  v_result:=app_private.command_before_delivery_reversals(action,data);
  select coalesce(jsonb_agg(d.value||jsonb_build_object('reversal',(select jsonb_build_object('id',r.id,'reference',r.reference,'reason',r.reason,'created_at',r.created_at,'actorId',r.actor_id,'reopenedOrder',r.reopened_order) from app_private.delivery_reversals r where r.organization_id=v_org and r.inspection_id=(d.value->>'id')::uuid),
   'correctsInspectionId',(select i.corrects_inspection_id from app_private.delivery_inspections i where i.id=(d.value->>'id')::uuid),
   'correctionId',(select i.id from app_private.delivery_inspections i where i.corrects_inspection_id=(d.value->>'id')::uuid),
   'lines',(select jsonb_agg(l.value||jsonb_build_object('unit_id',x.unit_id,'order_line_id',x.order_line_id) order by l.ordinality) from jsonb_array_elements(d.value->'lines') with ordinality l join app_private.delivery_inspection_lines x on x.id=(l.value->>'id')::uuid)) order by d.ordinality),'[]'::jsonb) into v_rows from jsonb_array_elements(v_result->'deliveries') with ordinality d;
  return v_result||jsonb_build_object('deliveries',v_rows);
 end if;
 if action='delivery_reversal_check' then
  if v_member.role<>'owner' then raise exception 'Only the owner can check or reverse saved deliveries' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||v_branch::text,1));
  return app_private.delivery_reversal_plan(v_org,v_branch,(data->>'receiptId')::uuid);
 end if;
 if action='reverse_delivery' then
  if v_member.role<>'owner' then raise exception 'Only the owner can check or reverse saved deliveries' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||v_branch::text,1));
  v_id:=(data->>'reversalId')::uuid;v_receipt:=(data->>'receiptId')::uuid;
  if v_id is null then raise exception 'A permanent delivery reversal ID is required';end if;
  select * into v_prior from app_private.delivery_reversals r where r.id=v_id;
  if v_prior.id is not null then
   if v_prior.organization_id<>v_org or v_prior.branch_id<>v_branch or v_prior.actor_id<>v_uid or v_prior.payload<>data then raise exception 'Delivery reversal ID conflict';end if;
   return jsonb_build_object('id',v_id,'duplicate',true);
  end if;
  if exists(select 1 from app_private.delivery_reversals r where r.inspection_id=v_receipt) then raise exception 'Delivery already reversed. Refresh its retained history';end if;
  if length(coalesce(v_reason,'')) not between 10 and 1000 or length(coalesce(v_reference,'')) not between 3 and 200 then raise exception 'Record a correction reference and at least ten characters of owner evidence';end if;
  if not coalesce((data->>'physicalConfirmed')::boolean,false) or not coalesce((data->>'queuesConfirmed')::boolean,false) then raise exception 'Confirm the physical goods and synchronization of every branch cashier PC';end if;
  v_plan:=app_private.delivery_reversal_plan(v_org,v_branch,v_receipt);
  if not (v_plan->>'eligible')::boolean then raise exception '%',v_plan->'reasons'->>0;end if;
  if data->>'expectedLedgerRevision' is distinct from v_plan->>'ledgerRevision' then raise exception 'Branch stock changed after the reversal check. Check it again before confirming';end if;
  select * into v_delivery from app_private.delivery_inspections d where d.id=v_receipt and d.organization_id=v_org and d.branch_id=v_branch;
  -- Lock projections before final stock validation; all normal stock commands share the branch advisory lock.
  perform 1 from public.branch_inventory i join app_private.delivery_inspection_lines l on l.inspection_id=v_receipt and l.product_id=i.product_id and l.batch_id is not distinct from i.batch_id where i.organization_id=v_org and i.branch_id=v_branch for update of i;
  v_plan:=app_private.delivery_reversal_plan(v_org,v_branch,v_receipt);
  if not (v_plan->>'eligible')::boolean then raise exception '%',v_plan->'reasons'->>0;end if;
  if data->>'expectedLedgerRevision' is distinct from v_plan->>'ledgerRevision' then raise exception 'Branch stock changed after the reversal check. Check it again before confirming';end if;
  v_recorded_at:=clock_timestamp();
  v_reopen:=(v_plan->>'reopensOrder')::boolean;
  insert into app_private.delivery_reversals values(v_id,v_org,v_branch,v_receipt,v_reference,v_reason,(v_plan->>'ledgerRevision')::bigint,v_reopen,v_uid,v_recorded_at,data);
  -- Cancel hold deductions first, then invert purchases. Readers see only the complete transaction.
  for v_movement in select m.* from public.inventory_movements m where m.organization_id=v_org and m.branch_id=v_branch and m.source_id=v_receipt order by (m.kind='hold_out') desc,m.id loop
   insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by,reversal_of,created_at)
    values(v_org,v_branch,v_movement.product_id,v_movement.batch_id,-v_movement.quantity,case when v_movement.kind='purchase' then 'purchase_reversal' else 'hold_cancel' end,v_id,v_uid,v_movement.id,v_recorded_at);
  end loop;
  for v_line in select l.* from app_private.delivery_inspection_lines l where l.inspection_id=v_receipt and l.hold_id is not null loop
   update public.stock_holds h set remaining=0 where h.id=v_line.hold_id;
   insert into public.stock_control_events(id,organization_id,branch_id,action,source_id,actor_id,payload,created_at) values(gen_random_uuid(),v_org,v_branch,'disposition_hold',v_line.hold_id,v_uid,jsonb_build_object('quantity',(v_line.held*v_line.factor)::text,'disposition','receiving_reversal','reversalId',v_id,'reason',v_reason),v_recorded_at);
  end loop;
  update public.stock_exceptions e set state='resolved',resolved_at=v_recorded_at,resolved_by=v_uid,resolution='Administrative reversal of mistaken inspection '||v_id::text||': '||v_reason where e.organization_id=v_org and e.branch_id=v_branch and e.source_id=v_receipt and e.kind='delivery_difference';
  if v_reopen then
   select coalesce(max(e.revision),0)+1 into v_revision from app_private.purchase_order_events e where e.order_id=v_delivery.order_id;
   insert into app_private.purchase_order_events values(v_id,v_org,v_branch,v_delivery.order_id,'approve','Reopened by delivery reversal '||v_id::text||': '||v_reason,v_uid,v_revision,v_recorded_at,jsonb_build_object('reversalId',v_id,'receiptId',v_receipt));
  end if;
  insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details,created_at) values(v_org,v_branch,v_uid,action,v_id,jsonb_build_object('receiptId',v_receipt,'reference',v_reference,'reason',v_reason,'reopenedOrder',v_reopen),v_recorded_at);
  return jsonb_build_object('id',v_id,'duplicate',false);
 end if;
 -- Serialize correction, disposition and claim checks with receiving/reversal writes.
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||v_branch::text,1));
 if action='disposition_hold' and exists(select 1 from app_private.delivery_inspection_lines l join app_private.delivery_reversals r on r.inspection_id=l.inspection_id where l.hold_id=(data->>'holdId')::uuid and r.organization_id=v_org) then raise exception 'This hold belongs to a reversed delivery and cannot move stock again';end if;
 if action='record_delivery_claim' and exists(select 1 from app_private.delivery_reversals r where r.organization_id=v_org and r.inspection_id=(data->>'receiptId')::uuid) then raise exception 'This inspection is reversed. Its original supplier evidence remains retained';end if;
 if action='inspect_delivery' then
  v_corrects:=nullif(data->>'correctsInspectionId','')::uuid;
  if v_corrects is not null then
   if v_member.role<>'owner' then raise exception 'Only the owner can save a linked corrected delivery' using errcode='42501';end if;
   if not exists(select 1 from app_private.delivery_reversals r where r.inspection_id=v_corrects and r.organization_id=v_org and r.branch_id=v_branch and r.id=(data->>'expectedReversalId')::uuid) then raise exception 'Select the original reversed inspection in this branch';end if;
   if exists(select 1 from app_private.delivery_inspections d where d.corrects_inspection_id=v_corrects and d.id<>(data->>'receiptId')::uuid) then raise exception 'This reversed inspection already has a linked correction';end if;
  end if;
  v_result:=app_private.command_before_delivery_reversals(action,data);
  if v_corrects is not null and not coalesce((v_result->>'duplicate')::boolean,false) then
   if not exists(select 1 from app_private.delivery_inspections d where d.id=(data->>'receiptId')::uuid and d.organization_id=v_org and d.corrects_inspection_id=v_corrects) then raise exception 'Corrected inspection lineage was not saved';end if;
  end if;
  return v_result;
 end if;
 return app_private.command_before_delivery_reversals(action,data);
end$$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
