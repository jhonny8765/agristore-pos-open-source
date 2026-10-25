-- Bounded catalogue refresh, durable investigations and explicit physical dispositions.
alter table public.organizations add column catalog_version bigint not null default 1;
create function app_private.bump_catalog() returns trigger language plpgsql set search_path='' as $$
begin
 update public.organizations set catalog_version=catalog_version+1 where id=new.organization_id;
 return new;
end $$;
create trigger catalog_changed after insert or update on public.products for each row execute function app_private.bump_catalog();
create trigger catalog_changed after insert or update on public.product_units for each row execute function app_private.bump_catalog();
create trigger catalog_changed after insert on public.unit_prices for each row execute function app_private.bump_catalog();
create trigger catalog_changed after insert or update on public.product_batches for each row execute function app_private.bump_catalog();

create table public.stock_exceptions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 branch_id uuid not null, kind text not null, source_id uuid not null, details jsonb not null default '{}',
 state text not null default 'open' check(state in ('open','resolved')), assigned_to text not null default '',
 resolution text, created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references auth.users,
 foreign key(organization_id,branch_id) references public.branches(organization_id,id), unique(organization_id,kind,source_id)
);
create index exception_work on public.stock_exceptions(organization_id,branch_id,state,created_at,id);
create table public.stock_holds (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 branch_id uuid not null, product_id uuid not null, batch_id uuid, quantity numeric(20,6) not null check(quantity>0),
 remaining numeric(20,6) not null check(remaining>=0 and remaining<=quantity), reason text not null,
 source_id uuid not null, created_at timestamptz not null default now(),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,product_id) references public.products(organization_id,id),
 foreign key(organization_id,batch_id) references public.product_batches(organization_id,id)
);
create index holds_work on public.stock_holds(organization_id,branch_id,created_at,id) where remaining>0;
create table public.stock_control_events (
 id uuid primary key, organization_id uuid not null references public.organizations, branch_id uuid not null,
 action text not null, source_id uuid not null, actor_id uuid not null references auth.users,
 payload jsonb not null, created_at timestamptz not null default now(),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create index stock_control_source on public.stock_control_events(source_id,action);
create trigger immutable_history before update or delete on public.stock_control_events for each row execute function app_private.immutable();
create table public.stock_issues (
 id uuid primary key, organization_id uuid not null references public.organizations, branch_id uuid not null,
 product_id uuid not null, batch_id uuid, quantity numeric(20,6) not null check(quantity>0),
 category text not null check(category in ('spillage','damage','expiry','supplier_return','staff_use','owner_use','unexplained')),
 disposition text not null check(disposition in ('hold','write_off')), reason text not null check(length(btrim(reason))>=3),
 requested_by uuid not null references auth.users, state text not null default 'pending' check(state in ('pending','approved')),
 approved_by uuid references auth.users, created_at timestamptz not null default now(),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,product_id) references public.products(organization_id,id),
 foreign key(organization_id,batch_id) references public.product_batches(organization_id,id)
);
create index stock_issues_work on public.stock_issues(organization_id,branch_id,state,created_at,id);
alter table public.stock_transfers add column received_quantity numeric(20,6) not null default 0,
 add column held_quantity numeric(20,6) not null default 0, add column lost_quantity numeric(20,6) not null default 0;
-- Historical complete receipts already entered their entire quantity once.
update public.stock_transfers set received_quantity=quantity where state='received';
alter table public.stock_transfers add constraint transfer_quantities check(received_quantity>=0 and held_quantity>=0 and lost_quantity>=0 and received_quantity+held_quantity+lost_quantity<=quantity);
alter table public.stock_transfers drop constraint stock_transfers_state_check;
alter table public.stock_transfers add constraint stock_transfers_state_check check(state in ('in_transit','received','closed_short'));
alter table public.inventory_movements drop constraint inventory_movements_kind_check;
alter table public.inventory_movements add constraint inventory_movements_kind_check check(kind in ('sale','refund','purchase','opening','transfer_out','transfer_in','adjustment','loss','hold_out','hold_release'));

do $$ declare t text; begin
 foreach t in array array['stock_exceptions','stock_holds','stock_control_events','stock_issues'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy branch_read on public.%I for select to authenticated using(app_private.can_access(organization_id,branch_id))',t);
 end loop;
end $$;

-- A persistent exception is independent of the recent audit preview.
create function app_private.capture_stock_exception() returns trigger language plpgsql set search_path='' as $$
begin
 if new.action='record_sale' and jsonb_array_length(coalesce(new.details->'flags','[]'))>0 then
  insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details)
   values(new.organization_id,new.branch_id,'sale_review',new.source_id,new.details) on conflict do nothing;
 elsif new.action='submit_count' then
  insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details)
   select c.organization_id,c.branch_id,'count_difference',c.id,jsonb_build_object('productId',c.product_id,'batchId',c.batch_id,'expected',c.expected::text,'counted',c.counted::text,'reason',c.reason)
   from public.stock_counts c where c.id=new.source_id and c.counted<>c.expected on conflict do nothing;
 end if;
 return new;
end $$;
create trigger capture_stock_exception after insert on public.audit_events for each row execute function app_private.capture_stock_exception();
insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details,created_at)
 select organization_id,branch_id,'sale_review',source_id,details,created_at from public.audit_events
 where action='record_sale' and jsonb_array_length(coalesce(details->'flags','[]'))>0
 on conflict do nothing;
insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details,created_at)
 select c.organization_id,c.branch_id,'count_difference',c.id,
 jsonb_build_object('productId',c.product_id,'batchId',c.batch_id,'expected',c.expected::text,'counted',c.counted::text,'reason',c.reason,'historicalCountState',c.state),c.created_at
 from public.stock_counts c where c.counted<>c.expected on conflict do nothing;

-- Keep the proven transaction implementation private; only the new dispatcher
-- can invoke it. Auth, session and branch checks also precede every new action.
do $patch$ declare definition text:=pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure);
begin
 if strpos(definition,$old$flags text[]:='{}';$old$)=0 then raise exception 'Stock-control migration anchor missing'; end if;
 execute replace(definition,$old$flags text[]:='{}';$old$,$new$flags text[]:=array[]::text[];$new$);
end $patch$;
alter function app_private.command(text,jsonb) rename to command_legacy;
revoke all on function app_private.command_legacy(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid;
 member public.staff_memberships; tr public.stock_transfers; sale public.sales; sh public.cashier_shifts;
 issue public.stock_issues; held public.stock_holds; prior public.stock_control_events; cnt public.stock_counts;
 ident uuid; q numeric; h numeric; remaining numeric; factor numeric; product uuid; batch uuid; item jsonb; ret jsonb;
 result jsonb; version text; disposition text; kind text; reason text:=btrim(data->>'reason');
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(
  select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=uid and (s.not_after is null or s.not_after>now())
 ) then raise exception 'Sign in again before making online changes' using errcode='42501'; end if;
 if action='bootstrap' then return app_private.command_legacy(action,data); end if;
 select * into member from public.staff_memberships where organization_id=org and user_id=uid and active and (role='owner' or branch_id=branch) order by (role='owner') desc limit 1 for share;
 if member.id is null or (branch is not null and not exists(select 1 from public.branches where id=branch and organization_id=org)) then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||coalesce(branch::text,''),1));

 if action='snapshot' then
  if jsonb_typeof(coalesce(data->'transactionIds','[]'))<>'array' or jsonb_array_length(coalesce(data->'transactionIds','[]'))>5000 then raise exception 'Request at most 5000 unresolved acknowledgments at a time'; end if;
  select catalog_version::text into version from public.organizations where id=org;
  if data->>'catalogVersion' is distinct from version then
   result:=app_private.command_legacy(action,data);
   return result||jsonb_build_object('catalogVersion',version,'catalogUnchanged',false);
  end if;
  update public.devices set last_sync=now() where id=(data->>'deviceId')::uuid and organization_id=org and branch_id=branch and active;
  return jsonb_build_object('asOf',now(),'products','[]'::jsonb,'catalogUnchanged',true,'catalogVersion',version,
   'stocks',coalesce((select jsonb_agg(jsonb_build_object('key',s.product_id::text||':'||coalesce(s.batch_id::text,'none'),'productId',s.product_id,'batchId',s.batch_id,'quantity',s.quantity::text)) from public.branch_inventory s where s.organization_id=org and s.branch_id=branch),'[]'::jsonb),
   'confirmedIds',coalesce((select jsonb_agg(s.id) from public.sales s where s.organization_id=org and s.branch_id=branch and s.id in(select value::uuid from jsonb_array_elements_text(coalesce(data->'transactionIds','[]')))),'[]'::jsonb));
 elsif action='stock_controls' then
  if member.role='cashier' then raise exception 'Stock control access denied' using errcode='42501'; end if;
  return jsonb_build_object(
   'openExceptions',(select count(*) from public.stock_exceptions e where e.organization_id=org and e.branch_id=branch and e.state='open'),
   'exceptions',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.stock_exceptions e where e.organization_id=org and e.branch_id=branch and e.state='open' order by created_at,id limit 50) e),'[]'::jsonb),
   'holds',coalesce((select jsonb_agg(to_jsonb(hold_row)||jsonb_build_object('quantity',hold_row.quantity::text,'remaining',hold_row.remaining::text)) from (select * from public.stock_holds r where r.organization_id=org and r.branch_id=branch and r.remaining>0 order by created_at,id limit 50) hold_row),'[]'::jsonb),
   'issues',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('quantity',s.quantity::text)) from (select * from public.stock_issues s where s.organization_id=org and s.branch_id=branch and s.state='pending' order by created_at,id limit 50) s),'[]'::jsonb));
 elsif action='resolve_stock_exception' then
  if member.role<>'owner' then raise exception 'Only the owner can resolve a stock investigation' using errcode='42501'; end if;
  if length(coalesce(reason,''))<10 then raise exception 'Record the evidence and outcome in at least 10 characters'; end if;
  if exists(select 1 from public.stock_exceptions e join public.stock_transfers t on t.id=e.source_id where e.id=(data->>'exceptionId')::uuid and e.kind='transfer_difference' and t.received_quantity+t.held_quantity+t.lost_quantity<t.quantity) then raise exception 'Receive or record the missing transfer quantity before resolving its investigation'; end if;
  update public.stock_exceptions set state='resolved',resolution=reason,resolved_at=now(),resolved_by=uid,assigned_to=coalesce(data->>'assignedTo',assigned_to)
   where id=(data->>'exceptionId')::uuid and organization_id=org and branch_id=branch returning id into ident;
  if ident is null then raise exception 'Stock investigation not found'; end if;
 elsif action in ('receive_transfer','write_off_transfer') then
  if member.role not in ('owner','manager','stock_staff') or (action='write_off_transfer' and member.role<>'owner') then raise exception 'Transfer receiving denied' using errcode='42501'; end if;
  select * into tr from public.stock_transfers where id=(data->>'transferId')::uuid and organization_id=org and destination_branch_id=branch for update;
  if tr.id is null then raise exception 'Transfer is not addressed to this branch'; end if;
  ident:=(data->>'receiptId')::uuid;
  if ident is null then raise exception 'Update the app and record the actual transfer quantities'; end if;
  select * into prior from public.stock_control_events where id=ident;
  if prior.id is not null then
   if prior.organization_id=org and prior.branch_id=branch and prior.actor_id=uid and prior.action=action and prior.payload=data then return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Transfer receipt ID conflict';
  end if;
  q:=(data->>'quantity')::numeric; h:=coalesce((data->>'heldQuantity')::numeric,0);
  remaining:=tr.quantity-tr.received_quantity-tr.held_quantity-tr.lost_quantity;
  if q is null or q<0 or h<0 or q+h<=0 or q+h>remaining or scale(trim_scale(q))>6 or scale(trim_scale(h))>6 then raise exception 'Enter actual quantities within the outstanding transfer amount'; end if;
  if (select base_unit from public.products where id=tr.product_id)='piece' and (q<>trunc(q) or h<>trunc(h)) then raise exception 'Piece stock must be a whole number'; end if;
  if length(coalesce(reason,''))<3 then raise exception 'Enter receiving notes or a shortage reason'; end if;
  if action='write_off_transfer' then
   if h<>0 then raise exception 'A transfer loss cannot include held goods'; end if;
   update public.stock_transfers set lost_quantity=lost_quantity+q where id=tr.id;
  else
   if q>0 then
    if exists(select 1 from public.product_batches where id=tr.batch_id and expires_on<(now() at time zone 'Asia/Manila')::date) then raise exception 'Expired goods must be received into hold'; end if;
    insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,tr.product_id,tr.batch_id,q,'transfer_in',ident,uid);
   end if;
   if h>0 then insert into public.stock_holds(organization_id,branch_id,product_id,batch_id,quantity,remaining,reason,source_id) values(org,branch,tr.product_id,tr.batch_id,h,h,reason,ident); end if;
   update public.stock_transfers set received_quantity=received_quantity+q,held_quantity=held_quantity+h where id=tr.id;
  end if;
  update public.stock_transfers set state=case when received_quantity+held_quantity+lost_quantity=quantity then case when lost_quantity>0 then 'closed_short' else 'received' end else 'in_transit' end,received_by=uid,received_at=now() where id=tr.id;
  insert into public.stock_control_events values(ident,org,branch,action,tr.id,uid,data,now());
  if q+h<remaining or h>0 or action='write_off_transfer' then
   insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details) values(org,branch,'transfer_difference',tr.id,jsonb_build_object('dispatched',tr.quantity::text,'notes',reason,'sourceBranch',tr.branch_id,'destinationBranch',branch)) on conflict do nothing;
  end if;
 elsif action='refund_sale' then
  if member.role<>'owner' then raise exception 'Only the owner can authorize a refund' using errcode='42501'; end if;
  ident:=(data->>'refundId')::uuid;
  select * into sale from public.sales where id=(data->>'saleId')::uuid and organization_id=org and branch_id=branch for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  select * into prior from public.stock_control_events where id=ident;
  if prior.id is not null then
   if prior.action=action and prior.actor_id=uid and prior.organization_id=org and prior.payload=data then return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Refund ID conflict';
  end if;
  if exists(select 1 from public.sale_reversals where sale_id=sale.id) then raise exception 'This sale has already been refunded'; end if;
  select * into sh from public.cashier_shifts where id=(data->>'shiftId')::uuid and organization_id=org and branch_id=branch and cashier_id=uid and closed_at is null for update;
  if sh.id is null then raise exception 'Open your own shift before issuing a cash refund'; end if;
  if reason is null or length(reason)<3 then raise exception 'Enter a refund reason'; end if;
  if jsonb_typeof(data->'returns') is distinct from 'array' or jsonb_array_length(data->'returns')<>jsonb_array_length(sale.payload->'items') then raise exception 'Record the returned quantity and disposition for every sale line'; end if;
  insert into public.sale_reversals(id,organization_id,branch_id,sale_id,shift_id,reason,created_by) values(ident,org,branch,sale.id,sh.id,reason,uid);
  for i in 0..jsonb_array_length(sale.payload->'items')-1 loop
   item:=sale.payload->'items'->i;
   select value into ret from jsonb_array_elements(data->'returns') where (value->>'lineIndex')::integer=i;
   if (select count(*) from jsonb_array_elements(data->'returns') where (value->>'lineIndex')::integer=i)<>1 then raise exception 'Each original sale line must have one return disposition'; end if;
   q:=(ret->>'quantity')::numeric; disposition:=ret->>'disposition'; factor:=(item->>'factor')::numeric;
   if q is null or q<0 or q>(item->>'quantity')::numeric or scale(trim_scale(q*factor))>6 or disposition is null or disposition not in ('resalable','hold','mixed','not_returned') or (q=0 and disposition<>'not_returned') or (q>0 and disposition='not_returned') then raise exception 'Enter returned quantities within the original sale and a valid disposition'; end if;
   h:=case when disposition='hold' then q when disposition='mixed' then q-(ret->>'resalableQuantity')::numeric else 0 end;
   if h is null or h<0 or h>q or scale(trim_scale(h*factor))>6 then raise exception 'Record the saleable portion within the total returned quantity'; end if;
   product:=(item->>'productId')::uuid; batch:=(item->>'batchId')::uuid;
   if (select base_unit from public.products where id=product)='piece' and (q*factor<>trunc(q*factor) or h*factor<>trunc(h*factor)) then raise exception 'Piece stock must be a whole number'; end if;
   if q-h>0 then
    if exists(select 1 from public.product_batches where id=batch and expires_on<(now() at time zone 'Asia/Manila')::date) then raise exception 'Expired returns must be held, not restored to saleable stock'; end if;
    insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,product,batch,(q-h)*factor,'refund',ident,uid);
   end if;
   if h>0 then
    insert into public.stock_holds(organization_id,branch_id,product_id,batch_id,quantity,remaining,reason,source_id) values(org,branch,product,batch,h*factor,h*factor,reason,ident);
   end if;
   if disposition<>'resalable' or q<>(item->>'quantity')::numeric then
    insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details) values(org,branch,'return_review',ident,jsonb_build_object('saleId',sale.id,'reason',reason)) on conflict do nothing;
   end if;
  end loop;
  insert into public.payments(organization_id,branch_id,sale_id,shift_id,reversal_id,amount) values(org,branch,sale.id,sh.id,ident,-sale.total);
  insert into public.stock_control_events values(ident,org,branch,action,sale.id,uid,data,now());
 elsif action='record_stock_issue' then
  if member.role not in ('owner','manager','stock_staff') then raise exception 'Stock issue access denied' using errcode='42501'; end if;
  ident:=(data->>'issueId')::uuid; q:=(data->>'quantity')::numeric;
  select * into issue from public.stock_issues where id=ident;
  if issue.id is not null then
   if exists(select 1 from public.stock_control_events where id=ident and actor_id=uid and payload=data) then return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Stock issue ID conflict';
  end if;
  product:=(data->>'productId')::uuid; batch:=(data->>'batchId')::uuid;
  if q is null or q::text='NaN' or q<=0 or scale(trim_scale(q))>6 or not exists(select 1 from public.products where id=product and organization_id=org) or (batch is not null and not exists(select 1 from public.product_batches where id=batch and organization_id=org and product_id=product)) then raise exception 'Enter a valid product, lot and quantity'; end if;
  if (select base_unit from public.products where id=product)='piece' and q<>trunc(q) then raise exception 'Piece stock must be a whole number'; end if;
  insert into public.stock_issues(id,organization_id,branch_id,product_id,batch_id,quantity,category,disposition,reason,requested_by) values(ident,org,branch,product,batch,q,data->>'category',data->>'disposition',reason,uid);
  insert into public.stock_control_events values(ident,org,branch,action,ident,uid,data,now());
 elsif action='approve_stock_issue' then
  if member.role<>'owner' then raise exception 'Only the owner can approve a stock issue' using errcode='42501'; end if;
  select * into issue from public.stock_issues where id=(data->>'issueId')::uuid and organization_id=org and branch_id=branch for update;
  if issue.id is null then raise exception 'Stock issue not found'; end if;
  if issue.state='approved' then return jsonb_build_object('id',issue.id,'duplicate',true); end if;
  if length(coalesce(reason,''))<3 then raise exception 'Record approval notes before changing stock'; end if;
  select quantity into remaining from public.branch_inventory where organization_id=org and branch_id=branch and product_id=issue.product_id and batch_id is not distinct from issue.batch_id for update;
  if coalesce(remaining,0)<issue.quantity then raise exception 'Available stock changed. Recount before approving this issue'; end if;
  kind:=case when issue.disposition='hold' then 'hold_out' else 'loss' end;
  insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,issue.product_id,issue.batch_id,-issue.quantity,kind,issue.id,uid);
  if issue.disposition='hold' then insert into public.stock_holds(organization_id,branch_id,product_id,batch_id,quantity,remaining,reason,source_id) values(org,branch,issue.product_id,issue.batch_id,issue.quantity,issue.quantity,issue.reason,issue.id); end if;
  update public.stock_issues set state='approved',approved_by=uid where id=issue.id;
  ident:=issue.id;
  insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details) values(org,branch,'stock_issue',ident,jsonb_build_object('category',issue.category,'quantity',issue.quantity::text,'reason',issue.reason)) on conflict do nothing;
 elsif action='disposition_hold' then
  if member.role<>'owner' then raise exception 'Only the owner can release or dispose held goods' using errcode='42501'; end if;
  ident:=(data->>'dispositionId')::uuid;
  select * into prior from public.stock_control_events where id=ident;
  if prior.id is not null then
   if prior.actor_id=uid and prior.organization_id=org and prior.action=action and prior.payload=data then return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Disposition ID conflict';
  end if;
  select * into held from public.stock_holds where id=(data->>'holdId')::uuid and organization_id=org and branch_id=branch for update;
  q:=(data->>'quantity')::numeric; disposition:=data->>'disposition';
  if held.id is null or q is null or q<=0 or q>held.remaining or scale(trim_scale(q))>6 or disposition is null or disposition not in ('release','dispose','supplier_return') or length(coalesce(reason,''))<3 then raise exception 'Enter a valid held quantity, outcome and reason'; end if;
  if (select base_unit from public.products where id=held.product_id)='piece' and q<>trunc(q) then raise exception 'Piece stock must be a whole number'; end if;
  if disposition='release' then
   if exists(select 1 from public.product_batches where id=held.batch_id and expires_on<(now() at time zone 'Asia/Manila')::date) then raise exception 'Expired held goods cannot be released for sale'; end if;
   insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,held.product_id,held.batch_id,q,'hold_release',ident,uid);
  end if;
  update public.stock_holds h set remaining=h.remaining-q where h.id=held.id;
  insert into public.stock_control_events values(ident,org,branch,action,held.id,uid,data,now());
 elsif action='approve_count' then
  if member.role<>'owner' then raise exception 'Only the owner can approve an adjustment' using errcode='42501'; end if;
  select * into cnt from public.stock_counts where id=(data->>'countId')::uuid and organization_id=org and branch_id=branch;
  if cnt.state='pending' and cnt.ledger_revision<>(select coalesce(max(id),0) from public.inventory_movements where organization_id=org and branch_id=branch) then raise exception 'Stock changed after counting. Submit a fresh count.'; end if;
  if cnt.counted_by=uid and cnt.state='pending' then
   if length(btrim(coalesce(data->>'witness','')))<3 or (data->>'recounted')::numeric is distinct from cnt.counted then raise exception 'Record an independent recount and witness before approving your own count'; end if;
  end if;
  return app_private.command_legacy(action,data);
 elsif action='dashboard' then
  result:=app_private.command_legacy(action,data);
  return result||jsonb_build_object('openStockExceptions',(select count(*) from public.stock_exceptions e where e.organization_id=org and (member.role='owner' or e.branch_id=branch) and e.state='open'));
 elsif action='receive_stock' then
  -- Preserve the immutable receiving request; a discrepancy is not extra stock.
  for item in select value from jsonb_array_elements(data->'items') loop
   if nullif(item->>'documentQuantity','') is not null then
    q:=(item->>'documentQuantity')::numeric;
    if q::text='NaN' or q<0 or scale(trim_scale(q))>6 then raise exception 'Enter a valid quantity from the supplier document'; end if;
    if q<>(item->>'quantity')::numeric and length(btrim(coalesce(item->>'deliveryNotes','')))<3 then raise exception 'Explain the difference between accepted goods and the supplier document'; end if;
   end if;
  end loop;
  result:=app_private.command_legacy(action,data);
  for item in select value from jsonb_array_elements(data->'items') loop
   if nullif(item->>'documentQuantity','') is not null and (item->>'documentQuantity')::numeric<>(item->>'quantity')::numeric then
    insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details) values(org,branch,'delivery_difference',(data->>'receiptId')::uuid,jsonb_build_object('reference',data->>'reference','item',item)) on conflict do nothing;
   end if;
  end loop;
  return result;
 else
  return app_private.command_legacy(action,data);
 end if;
 insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,uid,action,ident,data);
 return jsonb_build_object('id',ident,'ok',true);
end $$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
-- Replace the SQL wrapper to bind it to the new implementation after rename.
create or replace function public.agri_command(action text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select case when action in ('create_branch','rename_branch') then app_private.branch_command(action,data) else app_private.command(action,data) end
$$;

-- Targeted transaction/history lookup indexes; no history is pruned.
create index payments_shift on public.payments(organization_id,shift_id);
create index payments_sale on public.payments(organization_id,sale_id);
create index sales_shift on public.sales(organization_id,shift_id);
create index sales_device on public.sales(organization_id,device_id);
create index transfers_origin on public.stock_transfers(organization_id,branch_id,dispatched_at,id);
create index transfers_destination on public.stock_transfers(organization_id,destination_branch_id,dispatched_at,id);
create index audit_branch_time on public.audit_events(organization_id,branch_id,created_at,id);
alter policy member_read on public.staff_memberships using(user_id=(select auth.uid()) or app_private.can_access(organization_id,branch_id));
