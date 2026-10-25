-- Blind entries are private until two different authenticated counters seal matching observations.
-- No anonymous/public-table route exposes the expected balance or an unsealed counter's work.
create table app_private.blind_counts (
 id uuid primary key, organization_id uuid not null references public.organizations,
 branch_id uuid not null, product_id uuid not null, batch_id uuid,
 expected numeric(20,6) not null, ledger_revision bigint not null,
 started_by uuid not null references auth.users, reason text not null check(length(reason) between 3 and 1000),
 state text not null default 'first_count' check(state in ('first_count','recount','ready','disputed','approved','cancelled')),
 created_at timestamptz not null default now(), cancelled_by uuid references auth.users, cancelled_reason text,
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,product_id) references public.products(organization_id,id),
 foreign key(organization_id,batch_id) references public.product_batches(organization_id,id)
);
create index blind_counts_branch_page on app_private.blind_counts(organization_id,branch_id,created_at desc,id desc);
create table app_private.count_observations (
 id uuid primary key, count_id uuid not null references app_private.blind_counts,
 stage text not null check(stage in ('first','recount')), quantity numeric(20,6) not null check(quantity>=0 and quantity<>'NaN'::numeric),
 notes text not null check(length(notes) between 3 and 1000), observed_by uuid not null references auth.users, observed_name text not null,
 created_at timestamptz not null default now(), unique(count_id,stage)
);
create index count_observations_actor on app_private.count_observations(observed_by);
alter table public.stock_counts drop constraint stock_counts_state_check;
alter table public.stock_counts add constraint stock_counts_state_check check(state in ('pending','approved','cancelled'));
alter table public.stock_counts add column count_method text not null default 'legacy' check(count_method in ('legacy','blind_v1'));
alter table app_private.blind_counts enable row level security;
alter table app_private.count_observations enable row level security;
revoke all on app_private.blind_counts,app_private.count_observations from public,anon,authenticated;
create function app_private.protect_blind_count() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Count evidence is immutable; start a fresh count'; end if;
 if (to_jsonb(new)-array['state','cancelled_by','cancelled_reason']) is distinct from (to_jsonb(old)-array['state','cancelled_by','cancelled_reason'])
  or (old.state in ('approved','cancelled') and new is distinct from old) then
  raise exception 'Count evidence is immutable; start a fresh count';
 end if;
 return new;
end $$;
revoke all on function app_private.protect_blind_count() from public,anon,authenticated;
create trigger blind_count_evidence_immutable before update or delete on app_private.blind_counts
 for each row execute function app_private.protect_blind_count();
create trigger count_observations_immutable before update or delete on app_private.count_observations
 for each row execute function app_private.immutable();

alter function app_private.command(text,jsonb) rename to command_before_blind_counts;
revoke all on function app_private.command_before_blind_counts(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid;
 member public.staff_memberships; run app_private.blind_counts; first_entry app_private.count_observations;
 second_entry app_private.count_observations; prior app_private.count_observations; cnt public.stock_counts;
 prod public.products; ident uuid; observation uuid; qty numeric; revision bigint; result jsonb; count_stage text;
 count_reason text:=btrim(data->>'reason'); note text:=btrim(data->>'notes'); cursor_at timestamptz; cursor_id uuid;
begin
 if action='dashboard' then
  result:=app_private.command_before_blind_counts(action,data);
  return result||jsonb_build_object('pendingCounts',
   (select count(*) from app_private.blind_counts c where c.organization_id=org and c.state not in ('approved','cancelled')
    and (c.branch_id=branch or exists(select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=uid and m.active and m.role='owner')))
   +(select count(*) from public.stock_counts c where c.organization_id=org and c.state='pending' and c.count_method='legacy'
    and (c.branch_id=branch or exists(select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=uid and m.active and m.role='owner'))));
 end if;
 if action not in ('start_blind_count','record_blind_count','count_workspace','cancel_blind_count','submit_count','approve_count') then
  return app_private.command_before_blind_counts(action,data);
 end if;
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(
  select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=uid and (s.not_after is null or s.not_after>now())
 ) then raise exception 'Sign in again before making online changes' using errcode='42501'; end if;
 select * into member from public.staff_memberships where organization_id=org and user_id=uid and active
  and (role='owner' or branch_id=branch) order by (role='owner') desc limit 1 for share;
 if member.id is null or branch is null or not exists(select 1 from public.branches where id=branch and organization_id=org) then
  raise exception 'You do not have access to this branch' using errcode='42501'; end if;
 if action='approve_count' and member.role<>'owner' then raise exception 'Only the owner can approve an adjustment' using errcode='42501'; end if;
 if member.role not in ('owner','manager','stock_staff') then raise exception 'Stock count access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||branch::text,1));
 select coalesce(max(id),0) into revision from public.inventory_movements where organization_id=org and branch_id=branch;

 if action='count_workspace' then
  if data->>'beforeAt' is not null then cursor_at:=(data->>'beforeAt')::timestamptz; cursor_id:=(data->>'beforeId')::uuid;
   if cursor_id is null then raise exception 'Invalid count page. Refresh the count list.'; end if;
  elsif data->>'beforeId' is not null then raise exception 'Invalid count page. Refresh the count list.'; end if;
  select jsonb_build_object('rows',coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]'::jsonb)) into result from (
   select c.id,c.created_at,jsonb_build_object('id',c.id,'productId',c.product_id,'batchId',c.batch_id,
    'state',c.state,'reason',c.reason,'createdAt',c.created_at,'startedBy',c.started_by,
    'firstCounter',f.observed_by,'recounter',r.observed_by,'firstCounterName',f.observed_name,'recounterName',r.observed_name,'firstAt',f.created_at,'recountAt',r.created_at,
    'stale',c.state not in ('approved','cancelled') and c.ledger_revision<>revision,
    'expected',case when r.id is not null then c.expected::text end,
    'counted',case when r.id is not null then f.quantity::text end,
    'recounted',case when r.id is not null then r.quantity::text end,
    'firstNotes',case when r.id is not null then f.notes end,'recountNotes',case when r.id is not null then r.notes end,
    'cancelledReason',c.cancelled_reason) row_data
   from app_private.blind_counts c
   left join app_private.count_observations f on f.count_id=c.id and f.stage='first'
   left join app_private.count_observations r on r.count_id=c.id and r.stage='recount'
   where c.organization_id=org and c.branch_id=branch
    and (cursor_at is null or (c.created_at,c.id)<(cursor_at,cursor_id))
   order by c.created_at desc,c.id desc limit 51
  ) page;
  return result||jsonb_build_object('openCount',(select count(*) from app_private.blind_counts c where c.organization_id=org and c.branch_id=branch and c.state not in ('approved','cancelled')));
 end if;

 if action='submit_count' then raise exception 'Update the app and start a blind count. Typed witness names no longer authorize adjustments.'; end if;
 ident:=(data->>'countId')::uuid;
 if ident is null then raise exception 'A permanent count ID is required'; end if;
 select * into run from app_private.blind_counts c where c.id=ident for update;
 if action='start_blind_count' then
  if run.id is not null then
   if run.organization_id=org and run.branch_id=branch and run.started_by=uid and run.product_id=(data->>'productId')::uuid
    and run.batch_id is not distinct from (data->>'batchId')::uuid and run.reason=count_reason then
    return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Count ID conflict';
  end if;
  if length(coalesce(count_reason,'')) not between 3 and 1000 then raise exception 'Describe the counting scope in 3 to 1000 characters'; end if;
  select * into prod from public.products where organization_id=org and id=(data->>'productId')::uuid;
  if prod.id is null or ((data->>'batchId') is not null and not exists(select 1 from public.product_batches b where b.organization_id=org and b.product_id=prod.id and b.id=(data->>'batchId')::uuid))
   or (prod.tracks_expiry and data->>'batchId' is null) then raise exception 'Select a product and its current lot'; end if;
 else
  if run.id is null or run.organization_id<>org or run.branch_id<>branch then
   -- Historical completed approvals remain auditable/retryable, but pending legacy counts cannot bypass the new rule.
   if action='approve_count' then
    select * into cnt from public.stock_counts where id=ident and organization_id=org and branch_id=branch;
    if cnt.state='approved' then return jsonb_build_object('id',ident,'duplicate',true); end if;
    if cnt.id is not null then raise exception 'This legacy count needs a fresh blind count and independent recount'; end if;
   end if;
   raise exception 'Blind count not found';
  end if;
 end if;

 if action='cancel_blind_count' then
  if member.role<>'owner' and run.started_by<>uid then raise exception 'Only the owner or original counter can close this count' using errcode='42501'; end if;
  if run.state='approved' then raise exception 'An approved count cannot be cancelled'; end if;
  if length(coalesce(count_reason,'')) not between 3 and 1000 then raise exception 'Record why this count is being closed'; end if;
  if run.state='cancelled' then
   if run.cancelled_by<>uid or run.cancelled_reason<>count_reason then raise exception 'Count closure conflict'; end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  update app_private.blind_counts set state='cancelled',cancelled_by=uid,cancelled_reason=count_reason where id=ident;
  update public.stock_counts set state='cancelled' where id=ident and state='pending';
 elsif action='record_blind_count' then
  count_stage:=data->>'stage'; observation:=(data->>'observationId')::uuid;
  if count_stage not in ('first','recount') or count_stage is null or observation is null then raise exception 'Select a count stage and permanent observation ID'; end if;
  if coalesce(data->>'quantity','') !~ '^[0-9]+([.][0-9]{1,6})?$' then raise exception 'Enter a nonnegative quantity with at most six decimal places'; end if;
  qty:=(data->>'quantity')::numeric;
  if qty>=100000000000000 or length(coalesce(note,'')) not between 3 and 1000 then raise exception 'Enter a valid quantity and count notes'; end if;
  select * into prior from app_private.count_observations where id=observation or (count_id=ident and count_observations.stage=count_stage) limit 1;
  if prior.id is not null then
   if prior.id=observation and prior.count_id=ident and prior.stage=count_stage and prior.observed_by=uid and prior.quantity=qty and prior.notes=note then
    return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Sealed count conflict. Keep the original entry and start a fresh count if necessary.';
  end if;
  if (count_stage='first' and (run.state<>'first_count' or run.started_by<>uid)) then raise exception 'Only the original counter can seal this first count' using errcode='42501'; end if;
  if count_stage='recount' then
   if run.state<>'recount' then raise exception 'A sealed first count is required before recounting'; end if;
   if run.started_by=uid then raise exception 'A different signed-in person must perform the recount' using errcode='42501'; end if;
  end if;
  select * into prod from public.products where id=run.product_id and organization_id=org;
  if prod.base_unit='piece' and qty<>trunc(qty) then raise exception 'Count sealed pieces as whole numbers'; end if;
 elsif action='approve_count' then
  if run.state='approved' then
   select * into cnt from public.stock_counts where id=ident;
   if cnt.approved_by=uid and exists(select 1 from public.adjustment_approvals a where a.count_id=ident and a.reason=count_reason) then return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Adjustment already approved. Refresh its original record.';
  end if;
  if run.state<>'ready' then raise exception 'Two matching sealed counts are required before approval'; end if;
  select * into first_entry from app_private.count_observations where count_id=ident and count_observations.stage='first';
  select * into second_entry from app_private.count_observations where count_id=ident and count_observations.stage='recount';
  if uid in (first_entry.observed_by,second_entry.observed_by) then raise exception 'An owner who entered neither count must approve this adjustment' using errcode='42501'; end if;
  if length(coalesce(count_reason,'')) not between 3 and 1000 then raise exception 'Record the owner approval evidence'; end if;
 end if;

 -- Same branch lock as sales/receiving/transfers: no stock mutation can slip between revision check and adjustment.
 if action<>'cancel_blind_count' then
  perform 1 from public.devices where organization_id=org and branch_id=branch for update;
  if exists(select 1 from public.cashier_shifts where organization_id=org and branch_id=branch and closed_at is null) then raise exception 'Close and synchronize every shift before counting'; end if;
  if action<>'start_blind_count' and run.ledger_revision<>revision then raise exception 'Stock changed after counting. Submit a fresh count.'; end if;
  if action<>'start_blind_count' and exists(
   select 1 from app_private.count_observations o where o.count_id=ident and not exists(
    select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=o.observed_by and m.active
     and (m.role='owner' or (m.branch_id=branch and m.role in ('manager','stock_staff')))
   )
  ) then raise exception 'A counter no longer has stock access. Start a fresh count.' using errcode='42501'; end if;
 end if;
 if action='start_blind_count' then
  insert into app_private.blind_counts(id,organization_id,branch_id,product_id,batch_id,expected,ledger_revision,started_by,reason)
   values(ident,org,branch,prod.id,(data->>'batchId')::uuid,coalesce((select quantity from public.branch_inventory where organization_id=org and branch_id=branch and product_id=prod.id and batch_id is not distinct from (data->>'batchId')::uuid),0),revision,uid,count_reason);
 elsif action='record_blind_count' then
  insert into app_private.count_observations(id,count_id,stage,quantity,notes,observed_by,observed_name) values(observation,ident,count_stage,qty,note,uid,member.name);
  if count_stage='first' then update app_private.blind_counts set state='recount' where id=ident;
  else
   select * into first_entry from app_private.count_observations where count_id=ident and count_observations.stage='first';
   update app_private.blind_counts set state=case when first_entry.quantity=qty then 'ready' else 'disputed' end where id=ident;
   if first_entry.quantity=qty then
    insert into public.stock_counts(id,organization_id,branch_id,product_id,batch_id,expected,counted,ledger_revision,reason,counted_by,count_method,created_at)
     values(ident,org,branch,run.product_id,run.batch_id,run.expected,qty,revision,first_entry.notes,first_entry.observed_by,'blind_v1',first_entry.created_at);
   end if;
  end if;
 elsif action='approve_count' then
  insert into public.adjustment_approvals(organization_id,branch_id,count_id,approved_by,reason) values(org,branch,ident,uid,count_reason);
  if first_entry.quantity<>run.expected then
   insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by)
    values(org,branch,run.product_id,run.batch_id,first_entry.quantity-run.expected,'adjustment',ident,uid);
  end if;
  update public.stock_counts set state='approved',approved_by=uid where id=ident;
  update app_private.blind_counts set state='approved' where id=ident;
 end if;
 -- Audit records identify sealed evidence without leaking its quantity/notes to the next counter.
 insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details)
  values(org,branch,uid,action,ident,jsonb_build_object('observationId',observation,'stage',count_stage,'reason',case when action in ('approve_count','cancel_blind_count') then count_reason end));
 return jsonb_build_object('id',ident);
end $$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
