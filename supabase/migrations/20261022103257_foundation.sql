-- AgriStore: all mutations pass through authorized, transactional commands.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), created_at timestamptz not null default now());
create table public.branches (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), name text not null, code text not null, unique(organization_id,id), unique(organization_id,code));
create table public.staff_memberships (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id), branch_id uuid, role text not null check(role in ('owner','manager','cashier','stock_staff')), name text not null, active boolean not null default true, foreign key(organization_id,branch_id) references public.branches(organization_id,id), check(role<>'owner' or branch_id is null));
create unique index membership_unique on public.staff_memberships(organization_id,user_id,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index membership_user on public.staff_memberships(user_id,organization_id) where active;
create table public.devices (id uuid primary key, organization_id uuid not null, branch_id uuid not null, name text not null, registered_by uuid not null references auth.users, active boolean not null default true, last_sync timestamptz, unique(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id));
create unique index one_active_device_per_branch on public.devices(organization_id,branch_id) where active;
create table public.cashier_shifts (id uuid primary key default gen_random_uuid(), organization_id uuid not null, branch_id uuid not null, device_id uuid not null, cashier_id uuid not null references auth.users, opened_at timestamptz not null default now(), closed_at timestamptz, opening_cash bigint not null check(opening_cash>=0), counted_cash bigint check(counted_cash>=0), expected_cash bigint, unique(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,device_id) references public.devices(organization_id,id));
create unique index one_open_shift on public.cashier_shifts(device_id) where closed_at is null;
create table public.shift_authorizations (id uuid primary key default gen_random_uuid(), organization_id uuid not null, shift_id uuid not null, issued_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '12 hours', foreign key(organization_id,shift_id) references public.cashier_shifts(organization_id,id));
create table public.products (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, name text not null check(length(name) between 1 and 180), sku text not null, category text not null default 'Other', base_unit text not null check(base_unit in ('kg','liter','piece')), minimum_stock numeric(20,6) not null default 0 check(minimum_stock>=0), tracks_expiry boolean not null default false, active boolean not null default true, unique(organization_id,id), unique(organization_id,sku));
create table public.product_units (id uuid primary key default gen_random_uuid(), organization_id uuid not null, product_id uuid not null, name text not null, factor numeric(20,6) not null check(factor>0), price_version integer not null default 1, unique(organization_id,id), foreign key(organization_id,product_id) references public.products(organization_id,id));
create table public.unit_prices (organization_id uuid not null, unit_id uuid not null, version integer not null check(version>0), price bigint not null check(price>=0), cost bigint not null check(cost>=0), created_at timestamptz not null default now(), primary key(organization_id,unit_id,version), foreign key(organization_id,unit_id) references public.product_units(organization_id,id));
create table public.product_batches (id uuid primary key default gen_random_uuid(), organization_id uuid not null, product_id uuid not null, lot text not null, expires_on date, unique(organization_id,id), unique(organization_id,product_id,lot), foreign key(organization_id,product_id) references public.products(organization_id,id));
create table public.suppliers (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, name text not null, contact text not null default '', unique(organization_id,id));
create table public.purchase_receipts (id uuid primary key, organization_id uuid not null, branch_id uuid not null, supplier_id uuid, reference text not null, source text not null check(source in ('purchase','opening')), payload jsonb not null, created_by uuid not null references auth.users, created_at timestamptz not null default now(), foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,supplier_id) references public.suppliers(organization_id,id));
create table public.sales (id uuid primary key, organization_id uuid not null, branch_id uuid not null, device_id uuid not null, cashier_id uuid not null references auth.users, shift_id uuid not null, occurred_at timestamptz not null, received_at timestamptz not null default now(), total bigint not null check(total>=0), cash_received bigint not null check(cash_received>=total), receipt text not null, payload jsonb not null, flags text[] not null default '{}', unique(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,device_id) references public.devices(organization_id,id), foreign key(organization_id,shift_id) references public.cashier_shifts(organization_id,id));
create index sales_branch_time on public.sales(organization_id,branch_id,occurred_at);
create table public.sale_items (id bigint generated always as identity primary key, organization_id uuid not null, sale_id uuid not null, product_id uuid not null, unit_id uuid not null, batch_id uuid, quantity numeric(20,6) not null check(quantity>0), factor numeric(20,6) not null check(factor>0), price bigint not null check(price>=0), cost bigint not null check(cost>=0), line_total bigint not null check(line_total>=0), price_version integer not null, foreign key(organization_id,sale_id) references public.sales(organization_id,id), foreign key(organization_id,product_id) references public.products(organization_id,id), foreign key(organization_id,unit_id) references public.product_units(organization_id,id), foreign key(organization_id,batch_id) references public.product_batches(organization_id,id));
create table public.sale_reversals (id uuid primary key, organization_id uuid not null, branch_id uuid not null, sale_id uuid not null unique, shift_id uuid not null, reason text not null check(length(reason)>=3), created_by uuid not null references auth.users, created_at timestamptz not null default now(), foreign key(organization_id,sale_id) references public.sales(organization_id,id), foreign key(organization_id,shift_id) references public.cashier_shifts(organization_id,id));
create table public.payments (id uuid primary key default gen_random_uuid(), organization_id uuid not null, branch_id uuid not null, sale_id uuid not null, shift_id uuid not null, reversal_id uuid references public.sale_reversals, amount bigint not null, method text not null default 'cash' check(method='cash'), created_at timestamptz not null default now(), foreign key(organization_id,sale_id) references public.sales(organization_id,id), foreign key(organization_id,shift_id) references public.cashier_shifts(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id));
create table public.stock_transfers (id uuid primary key, organization_id uuid not null, branch_id uuid not null, destination_branch_id uuid not null, product_id uuid not null, batch_id uuid, quantity numeric(20,6) not null check(quantity>0), state text not null default 'in_transit' check(state in ('in_transit','received')), dispatched_by uuid not null references auth.users, dispatched_at timestamptz not null default now(), received_by uuid references auth.users, received_at timestamptz, foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,destination_branch_id) references public.branches(organization_id,id), foreign key(organization_id,product_id) references public.products(organization_id,id), foreign key(organization_id,batch_id) references public.product_batches(organization_id,id), check(branch_id<>destination_branch_id));
create table public.stock_counts (id uuid primary key, organization_id uuid not null, branch_id uuid not null, product_id uuid not null, batch_id uuid, expected numeric(20,6) not null, counted numeric(20,6) not null check(counted>=0), ledger_revision bigint not null, reason text not null, state text not null default 'pending' check(state in ('pending','approved')), counted_by uuid not null references auth.users, approved_by uuid references auth.users, created_at timestamptz not null default now(), foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,product_id) references public.products(organization_id,id), foreign key(organization_id,batch_id) references public.product_batches(organization_id,id));
create table public.adjustment_approvals (id uuid primary key default gen_random_uuid(), organization_id uuid not null, branch_id uuid not null, count_id uuid not null references public.stock_counts, approved_by uuid not null references auth.users, reason text not null, created_at timestamptz not null default now(), unique(count_id));
create table public.inventory_movements (id bigint generated always as identity primary key, organization_id uuid not null, branch_id uuid not null, product_id uuid not null, batch_id uuid, quantity numeric(20,6) not null check(quantity<>0), kind text not null check(kind in ('sale','refund','purchase','opening','transfer_out','transfer_in','adjustment')), source_id uuid not null, created_by uuid not null references auth.users, created_at timestamptz not null default now(), foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,product_id) references public.products(organization_id,id), foreign key(organization_id,batch_id) references public.product_batches(organization_id,id));
create index movements_branch on public.inventory_movements(organization_id,branch_id,id);
create table public.branch_inventory (organization_id uuid not null, branch_id uuid not null, product_id uuid not null, batch_id uuid, batch_key uuid generated always as(coalesce(batch_id,'00000000-0000-0000-0000-000000000000'::uuid)) stored, quantity numeric(20,6) not null default 0, primary key(organization_id,branch_id,product_id,batch_key), foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,product_id) references public.products(organization_id,id), foreign key(organization_id,batch_id) references public.product_batches(organization_id,id));
create table public.audit_events (id bigint generated always as identity primary key, organization_id uuid not null references public.organizations, branch_id uuid, actor_id uuid not null references auth.users, action text not null, source_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now());

create function app_private.can_access(org uuid, branch uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.staff_memberships m where m.user_id=auth.uid() and m.organization_id=org and m.active and (m.role='owner' or branch is null or m.branch_id=branch))
$$;
revoke all on function app_private.can_access(uuid,uuid) from public;
grant execute on function app_private.can_access(uuid,uuid) to authenticated;
create function app_private.can_checkout(org uuid, branch uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.staff_memberships m where m.user_id=auth.uid() and m.organization_id=org and m.active and (m.role='owner' or (m.branch_id=branch and m.role in ('cashier','manager'))))
$$;
revoke all on function app_private.can_checkout(uuid,uuid) from public;
grant execute on function app_private.can_checkout(uuid,uuid) to authenticated;
create function app_private.project_movement() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.products where id=new.product_id and organization_id=new.organization_id) or (new.batch_id is not null and not exists(select 1 from public.product_batches where id=new.batch_id and organization_id=new.organization_id and product_id=new.product_id)) then raise exception 'Invalid product or batch'; end if;
 insert into public.branch_inventory(organization_id,branch_id,product_id,batch_id,quantity) values(new.organization_id,new.branch_id,new.product_id,new.batch_id,new.quantity)
 on conflict(organization_id,branch_id,product_id,batch_key) do update set quantity=public.branch_inventory.quantity+excluded.quantity;
 return new;
end $$;
create trigger project_movement after insert on public.inventory_movements for each row execute function app_private.project_movement();
create function app_private.immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'History is immutable; create a linked reversal'; end $$;
do $$ declare t text; begin
 foreach t in array array['sales','sale_items','payments','sale_reversals','inventory_movements','audit_events','unit_prices','purchase_receipts','adjustment_approvals','shift_authorizations'] loop
 execute format('create trigger immutable_history before update or delete on public.%I for each row execute function app_private.immutable()',t);
 end loop;
end $$;

-- One private implementation, exposed through a SECURITY INVOKER wrapper only.
create function app_private.command(action text, data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid;
 member public.staff_memberships; dev public.devices; sh public.cashier_shifts; prod public.products; un public.product_units; price public.unit_prices; batch public.product_batches;
 existing public.sales; tr public.stock_transfers; cnt public.stock_counts; row_item jsonb; result jsonb; ident uuid; b_id uuid; q numeric; factor numeric; amount bigint; sum_total bigint:=0; expected_cash bigint; rev bigint; flags text[]:='{}'; sale_time timestamptz; receipt text; source text; new_version integer; organization_name text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=uid and (s.not_after is null or s.not_after>now())) then raise exception 'Sign in again before making online changes' using errcode='42501'; end if;
 if action='bootstrap' then
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.staff_memberships where user_id=uid) then raise exception 'Your business is already configured'; end if;
  organization_name:=trim(data->>'name');
  if length(organization_name)<1 then raise exception 'Enter the business name'; end if;
  insert into public.organizations(name) values(organization_name) returning id into org;
  insert into public.staff_memberships(organization_id,user_id,role,name) values(org,uid,'owner',coalesce(nullif(data->>'ownerName',''),'Owner'));
  insert into public.branches(organization_id,name,code) values(org,'Branch 1','B01'),(org,'Branch 2','B02'),(org,'Branch 3','B03');
  return jsonb_build_object('organizationId',org);
 end if;
 select * into member from public.staff_memberships where user_id=uid and organization_id=org and active and (role='owner' or branch_id=branch) order by (role='owner') desc limit 1;
 if member.id is null then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
 if branch is not null and not exists(select 1 from public.branches where id=branch and organization_id=org) then raise exception 'Invalid branch' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||coalesce(branch::text,''),1));
 if action='register_device' then
  if member.role not in ('owner','manager') then raise exception 'A manager must register this device' using errcode='42501'; end if;
  ident:=(data->>'deviceId')::uuid;
  select * into dev from public.devices where id=ident;
  if found and (dev.organization_id<>org or dev.branch_id<>branch or not dev.active) then raise exception 'This device is registered elsewhere or disabled'; end if;
  insert into public.devices(id,organization_id,branch_id,name,registered_by) values(ident,org,branch,coalesce(nullif(data->>'name',''),'Cashier PC'),uid) on conflict(id) do nothing;
  return jsonb_build_object('deviceId',ident);
 elsif action in ('open_shift','renew_shift') then
  if member.role not in ('owner','manager','cashier') then raise exception 'This role cannot operate checkout' using errcode='42501'; end if;
  select * into dev from public.devices where id=(data->>'deviceId')::uuid and organization_id=org and branch_id=branch and active for update;
  if dev.id is null then raise exception 'Ask a manager to register this PC'; end if;
  select * into sh from public.cashier_shifts where device_id=dev.id and closed_at is null for update;
  if sh.id is not null and sh.cashier_id<>uid then raise exception 'Another cashier has an open shift'; end if;
  if sh.id is null then
   if action='renew_shift' then raise exception 'No open shift to renew'; end if;
   insert into public.cashier_shifts(organization_id,branch_id,device_id,cashier_id,opening_cash) values(org,branch,dev.id,uid,(data->>'openingCash')::bigint) returning * into sh;
  end if;
  insert into public.shift_authorizations(organization_id,shift_id) values(org,sh.id) returning jsonb_build_object('organizationId',org,'branchId',branch,'deviceId',dev.id,'cashierId',uid,'shiftId',sh.id,'issuedAt',floor(extract(epoch from issued_at)*1000),'expiresAt',floor(extract(epoch from expires_at)*1000),'name',member.name,'role',member.role) into result;
  return result;
 elsif action='close_shift' then
  select * into sh from public.cashier_shifts where id=(data->>'shiftId')::uuid and organization_id=org and branch_id=branch for update;
  if sh.id is null or sh.cashier_id<>uid then raise exception 'Only the shift cashier can close it' using errcode='42501'; end if;
  if sh.closed_at is not null then return to_jsonb(sh); end if;
  select sh.opening_cash+coalesce(sum(amount),0) into expected_cash from public.payments where shift_id=sh.id;
  update public.cashier_shifts set closed_at=now(),expected_cash=expected_cash,counted_cash=(data->>'countedCash')::bigint where id=sh.id returning to_jsonb(cashier_shifts.*) into result;
  insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,uid,action,sh.id,jsonb_build_object('expected',expected_cash,'counted',data->>'countedCash'));
  return result;
 elsif action='record_sale' then
  if member.role not in ('owner','manager','cashier') then raise exception 'Sales access denied' using errcode='42501'; end if;
  ident:=(data->>'transactionId')::uuid;
  -- Serialize duplicates before inspecting payload. Never overwrite an existing sale.
  perform pg_advisory_xact_lock(hashtextextended(org::text||ident::text,0));
  select * into existing from public.sales where id=ident;
  if existing.id is not null then
   if existing.organization_id<>org or existing.branch_id<>branch or existing.cashier_id<>uid then raise exception 'Transaction access denied' using errcode='42501'; end if;
   if existing.payload<>data then return jsonb_build_object('transactionId',ident,'status','review','reason','This transaction ID already contains a different sale'); end if;
   return jsonb_build_object('transactionId',ident,'status','duplicate','receipt',existing.receipt,'flags',existing.flags);
  end if;
  if (data->>'version')::int is distinct from 1 or data->>'cashierId' is distinct from uid::text or jsonb_typeof(data->'items') is distinct from 'array' or jsonb_array_length(data->'items') not between 1 and 100 then raise exception 'Invalid sale envelope'; end if;
  select * into sh from public.cashier_shifts where id=(data->>'shiftId')::uuid and organization_id=org and branch_id=branch and cashier_id=uid for update;
  if sh.id is null or sh.closed_at is not null or sh.device_id<>(data->>'deviceId')::uuid then raise exception 'Invalid or closed shift'; end if;
  if not exists(select 1 from public.devices where id=sh.device_id and active) then raise exception 'Device access revoked' using errcode='42501'; end if;
  sale_time:=(data->>'occurredAt')::timestamptz;
  if sale_time>now()+interval '5 minutes' or not exists(select 1 from public.shift_authorizations a where a.shift_id=sh.id and sale_time between a.issued_at-interval '2 minutes' and a.expires_at) then raise exception 'Sale falls outside the authorized shift window'; end if;
  -- Validate every immutable catalog price and unit, including historic price versions.
  for row_item in select value from jsonb_array_elements(data->'items') loop
   select * into prod from public.products where id=(row_item->>'productId')::uuid and organization_id=org;
   select * into un from public.product_units where id=(row_item->>'unitId')::uuid and organization_id=org and product_id=prod.id;
   select * into price from public.unit_prices where organization_id=org and unit_id=un.id and version=(row_item->>'priceVersion')::int;
   if prod.id is null or un.id is null or price.unit_id is null then raise exception 'Unknown product, unit, or price version'; end if;
   q:=(row_item->>'quantity')::numeric; factor:=(row_item->>'factor')::numeric;
   if q<=0 or q>=1000000000000 or scale(q)>6 or factor<>un.factor or scale(q*factor)>6 or q*factor>=100000000000000 then raise exception 'Invalid quantity conversion'; end if;
   if (row_item->>'unitPrice')::bigint<>price.price or (row_item->>'unitCost')::bigint<>price.cost then raise exception 'Price does not match the recorded catalog version'; end if;
   amount:=round(q*price.price)::bigint;
   if amount<>(row_item->>'lineTotal')::bigint then raise exception 'Invalid line amount'; end if;
   sum_total:=sum_total+amount;
   b_id:=(row_item->>'batchId')::uuid;
   if b_id is not null then select * into batch from public.product_batches where id=b_id and product_id=prod.id and organization_id=org; if batch.id is null or batch.expires_on<(sale_time at time zone 'Asia/Manila')::date then raise exception 'Invalid or expired batch'; end if;
   elsif prod.tracks_expiry then raise exception 'A batch is required'; end if;
   if un.price_version<>price.version then flags:=array_append(flags,'price_changed'); end if;
   if not prod.active then flags:=array_append(flags,'product_inactive'); end if;
  end loop;
  if sum_total<>(data->>'total')::bigint or (data->>'cashReceived')::bigint<sum_total or sum_total>9007199254740991 then raise exception 'Invalid cash or sale total'; end if;
  select code||'-'||upper(left(replace(ident::text,'-',''),12)) into receipt from public.branches where id=branch;
  insert into public.sales(id,organization_id,branch_id,device_id,cashier_id,shift_id,occurred_at,total,cash_received,receipt,payload,flags) values(ident,org,branch,sh.device_id,uid,sh.id,sale_time,sum_total,(data->>'cashReceived')::bigint,receipt,data,flags);
  for row_item in select value from jsonb_array_elements(data->'items') order by value->>'productId',value->>'batchId' loop
   b_id:=(row_item->>'batchId')::uuid; q:=(row_item->>'quantity')::numeric; factor:=(row_item->>'factor')::numeric;
   insert into public.sale_items(organization_id,sale_id,product_id,unit_id,batch_id,quantity,factor,price,cost,line_total,price_version) values(org,ident,(row_item->>'productId')::uuid,(row_item->>'unitId')::uuid,b_id,q,factor,(row_item->>'unitPrice')::bigint,(row_item->>'unitCost')::bigint,(row_item->>'lineTotal')::bigint,(row_item->>'priceVersion')::int);
   insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,(row_item->>'productId')::uuid,b_id,-q*factor,'sale',ident,uid);
  end loop;
  if exists(select 1 from public.branch_inventory where organization_id=org and branch_id=branch and quantity<0) then
   flags:=array_append(flags,'stock_shortage');
   -- Flags are captured by the separate append-only audit record, preserving sale immutability.
  end if;
  insert into public.payments(organization_id,branch_id,sale_id,shift_id,amount) values(org,branch,ident,sh.id,sum_total);
  insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,uid,action,ident,jsonb_build_object('flags',flags));
  return jsonb_build_object('transactionId',ident,'status','created','receipt',receipt,'flags',flags);
 elsif action='snapshot' then
  update public.devices set last_sync=now() where id=(data->>'deviceId')::uuid and organization_id=org and branch_id=branch and active;
  select jsonb_build_object('asOf',now(),'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku,'category',p.category,'baseUnit',p.base_unit,'minimumStock',p.minimum_stock::text,'tracksExpiry',p.tracks_expiry,'active',p.active,
   'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'factor',u.factor::text,'price',pr.price,'cost',pr.cost,'priceVersion',u.price_version)) from public.product_units u join public.unit_prices pr on pr.organization_id=u.organization_id and pr.unit_id=u.id and pr.version=u.price_version where u.product_id=p.id),'[]'::jsonb),
   'batches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'lot',b.lot,'expiresOn',b.expires_on) order by b.expires_on nulls last) from public.product_batches b where b.product_id=p.id),'[]'::jsonb))) from public.products p where p.organization_id=org),'[]'::jsonb),
   'stocks',coalesce((select jsonb_agg(jsonb_build_object('key',i.product_id::text||':'||coalesce(i.batch_id::text,'none'),'productId',i.product_id,'batchId',i.batch_id,'quantity',i.quantity::text)) from public.branch_inventory i where i.organization_id=org and i.branch_id=branch),'[]'::jsonb),
   'confirmedIds',coalesce((select jsonb_agg(s.id) from public.sales s where s.organization_id=org and s.branch_id=branch and s.id in(select value::uuid from jsonb_array_elements_text(coalesce(data->'transactionIds','[]')))),'[]'::jsonb)) into result;
  return result;
 elsif action='create_product' then
  if member.role<>'owner' then raise exception 'Only the owner can change the catalog' using errcode='42501'; end if;
  insert into public.products(organization_id,name,sku,category,base_unit,minimum_stock,tracks_expiry) values(org,trim(data->>'name'),trim(data->>'sku'),data->>'category',data->>'baseUnit',coalesce((data->>'minimumStock')::numeric,0),coalesce((data->>'tracksExpiry')::boolean,false)) returning id into ident;
  for row_item in select value from jsonb_array_elements(data->'units') loop
   insert into public.product_units(organization_id,product_id,name,factor) values(org,ident,row_item->>'name',(row_item->>'factor')::numeric) returning id into b_id;
   insert into public.unit_prices(organization_id,unit_id,version,price,cost) values(org,b_id,1,(row_item->>'price')::bigint,(row_item->>'cost')::bigint);
  end loop;
  if not exists(select 1 from public.product_units where product_id=ident) then raise exception 'At least one selling unit is required'; end if;
 elsif action='set_price' then
  if member.role<>'owner' then raise exception 'Only the owner can change prices' using errcode='42501'; end if;
  select * into un from public.product_units where id=(data->>'unitId')::uuid and organization_id=org for update;
  if un.id is null then raise exception 'Unknown unit'; end if;
  new_version:=un.price_version+1;
  insert into public.unit_prices(organization_id,unit_id,version,price,cost) values(org,un.id,new_version,(data->>'price')::bigint,(data->>'cost')::bigint);
  update public.product_units set price_version=new_version where id=un.id; ident:=un.id;
 elsif action='create_supplier' then
  if member.role not in ('owner','manager') then raise exception 'Supplier access denied' using errcode='42501'; end if;
  insert into public.suppliers(organization_id,name,contact) values(org,trim(data->>'name'),coalesce(data->>'contact','')) returning id into ident;
 elsif action='receive_stock' then
  if member.role not in ('owner','manager','stock_staff') then raise exception 'Receiving access denied' using errcode='42501'; end if;
  ident:=(data->>'receiptId')::uuid; perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
  if exists(select 1 from public.purchase_receipts where id=ident) then
   if not exists(select 1 from public.purchase_receipts where id=ident and organization_id=org and branch_id=branch and payload=data) then raise exception 'Receipt ID conflict'; end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  source:=coalesce(data->>'source','purchase');
  if source='opening' and member.role<>'owner' then raise exception 'Only the owner can import opening stock' using errcode='42501'; end if;
  insert into public.purchase_receipts(id,organization_id,branch_id,supplier_id,reference,source,payload,created_by) values(ident,org,branch,(data->>'supplierId')::uuid,data->>'reference',source,data,uid);
  if jsonb_array_length(data->'items') not between 1 and 1000 then raise exception 'Enter receiving items'; end if;
  for row_item in select value from jsonb_array_elements(data->'items') order by value->>'productId' loop
   select * into prod from public.products where id=(row_item->>'productId')::uuid and organization_id=org;
   select * into un from public.product_units where id=(row_item->>'unitId')::uuid and product_id=prod.id and organization_id=org;
   if prod.id is null or un.id is null then raise exception 'Invalid receiving product or unit'; end if;
   q:=(row_item->>'quantity')::numeric*un.factor;
   if q<=0 or scale(q)>6 then raise exception 'Invalid receiving quantity'; end if;
   b_id:=null;
   if nullif(row_item->>'lot','') is not null then
    insert into public.product_batches(organization_id,product_id,lot,expires_on) values(org,prod.id,row_item->>'lot',(row_item->>'expiresOn')::date) on conflict(organization_id,product_id,lot) do nothing;
    select id into b_id from public.product_batches where organization_id=org and product_id=prod.id and lot=row_item->>'lot' and expires_on is not distinct from (row_item->>'expiresOn')::date;
    if b_id is null then raise exception 'Existing lot has a different expiry date'; end if;
   elsif prod.tracks_expiry then raise exception 'Batch lot and expiry are required'; end if;
   if prod.tracks_expiry and nullif(row_item->>'expiresOn','') is null then raise exception 'Expiry date is required'; end if;
   insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,prod.id,b_id,q,source,ident,uid);
  end loop;
 elsif action='dispatch_transfer' then
  if member.role not in ('owner','manager') then raise exception 'Transfer access denied' using errcode='42501'; end if;
  ident:=(data->>'transferId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
  if exists(select 1 from public.stock_transfers where id=ident) then raise exception 'Transfer already recorded; refresh the list'; end if;
  q:=(data->>'quantity')::numeric; b_id:=(data->>'batchId')::uuid;
  select quantity into factor from public.branch_inventory where organization_id=org and branch_id=branch and product_id=(data->>'productId')::uuid and batch_id is not distinct from b_id for update;
  if factor is null or q<=0 or q>factor then raise exception 'Insufficient stock for this transfer'; end if;
  insert into public.stock_transfers(id,organization_id,branch_id,destination_branch_id,product_id,batch_id,quantity,dispatched_by) values(ident,org,branch,(data->>'destinationBranchId')::uuid,(data->>'productId')::uuid,b_id,q,uid);
  insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,(data->>'productId')::uuid,b_id,-q,'transfer_out',ident,uid);
 elsif action='receive_transfer' then
  if member.role not in ('owner','manager','stock_staff') then raise exception 'Transfer receiving denied' using errcode='42501'; end if;
  select * into tr from public.stock_transfers where id=(data->>'transferId')::uuid and organization_id=org and destination_branch_id=branch for update;
  if tr.id is null then raise exception 'Transfer is not addressed to this branch'; end if;
  if tr.state='received' then return to_jsonb(tr); end if;
  update public.stock_transfers set state='received',received_by=uid,received_at=now() where id=tr.id;
  insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,tr.product_id,tr.batch_id,tr.quantity,'transfer_in',tr.id,uid); ident:=tr.id;
 elsif action in ('submit_count','approve_count') then
  if member.role not in ('owner','manager','stock_staff') then raise exception 'Stock count access denied' using errcode='42501'; end if;
  -- Count only a reconciled, closed branch; prevent new shifts while this command executes.
  perform 1 from public.devices where organization_id=org and branch_id=branch for update;
  if exists(select 1 from public.cashier_shifts where organization_id=org and branch_id=branch and closed_at is null) then raise exception 'Close and synchronize every shift before counting'; end if;
  if action='submit_count' then
   ident:=(data->>'countId')::uuid; b_id:=(data->>'batchId')::uuid;
   select coalesce(max(id),0) into rev from public.inventory_movements where organization_id=org and branch_id=branch;
   select quantity into factor from public.branch_inventory where organization_id=org and branch_id=branch and product_id=(data->>'productId')::uuid and batch_id is not distinct from b_id;
   insert into public.stock_counts(id,organization_id,branch_id,product_id,batch_id,expected,counted,ledger_revision,reason,counted_by) values(ident,org,branch,(data->>'productId')::uuid,b_id,coalesce(factor,0),(data->>'counted')::numeric,rev,data->>'reason',uid);
  else
   if member.role<>'owner' then raise exception 'Only the owner can approve an adjustment' using errcode='42501'; end if;
   select * into cnt from public.stock_counts where id=(data->>'countId')::uuid and organization_id=org and branch_id=branch for update;
   if cnt.id is null then raise exception 'Count not found'; end if;
   if cnt.state='approved' then return to_jsonb(cnt); end if;
   select coalesce(max(id),0) into rev from public.inventory_movements where organization_id=org and branch_id=branch;
   if rev<>cnt.ledger_revision then raise exception 'Stock changed after counting. Submit a fresh count.'; end if;
   insert into public.adjustment_approvals(organization_id,branch_id,count_id,approved_by,reason) values(org,branch,cnt.id,uid,cnt.reason);
   if cnt.counted<>cnt.expected then insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,cnt.product_id,cnt.batch_id,cnt.counted-cnt.expected,'adjustment',cnt.id,uid); end if;
   update public.stock_counts set state='approved',approved_by=uid where id=cnt.id; ident:=cnt.id;
  end if;
 elsif action='refund_sale' then
  if member.role<>'owner' then raise exception 'Only the owner can authorize a refund' using errcode='42501'; end if;
  select * into existing from public.sales where id=(data->>'saleId')::uuid and organization_id=org and branch_id=branch for update;
  if existing.id is null then raise exception 'Sale not found'; end if;
  select * into sh from public.cashier_shifts where id=(data->>'shiftId')::uuid and organization_id=org and branch_id=branch and cashier_id=uid and closed_at is null for update;
  if sh.id is null then raise exception 'Open your own shift before issuing a cash refund'; end if;
  if exists(select 1 from public.sale_reversals where sale_id=existing.id) then raise exception 'This sale has already been refunded'; end if;
  ident:=(data->>'refundId')::uuid;
  insert into public.sale_reversals(id,organization_id,branch_id,sale_id,shift_id,reason,created_by) values(ident,org,branch,existing.id,sh.id,data->>'reason',uid);
  insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) select org,branch,i.product_id,i.batch_id,i.quantity*i.factor,'refund',ident,uid from public.sale_items i where i.sale_id=existing.id order by i.product_id,i.batch_id;
  insert into public.payments(organization_id,branch_id,sale_id,shift_id,reversal_id,amount) values(org,branch,existing.id,sh.id,ident,-existing.total);
 elsif action='staff_access' then
  if member.role<>'owner' then raise exception 'Only the owner manages staff' using errcode='42501'; end if;
  select id into ident from auth.users where lower(email)=lower(data->>'email');
  if ident is null then raise exception 'The employee must sign up first'; end if;
  if ident=uid then raise exception 'Use another employee account'; end if;
  if data->>'role' not in ('manager','cashier','stock_staff') then raise exception 'Choose a branch staff role'; end if;
  insert into public.staff_memberships(organization_id,user_id,branch_id,role,name) values(org,ident,branch,data->>'role',data->>'name') on conflict(organization_id,user_id,(coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid))) do update set role=excluded.role,name=excluded.name,active=true;
 elsif action='revoke_staff' then
  if member.role<>'owner' then raise exception 'Only the owner manages staff' using errcode='42501'; end if;
  update public.staff_memberships set active=false where id=(data->>'membershipId')::uuid and organization_id=org and role<>'owner' returning id into ident;
  if ident is null then raise exception 'Employee not found'; end if;
 elsif action='rename_branch' then
  if member.role<>'owner' then raise exception 'Only the owner can rename branches' using errcode='42501'; end if;
  update public.branches set name=data->>'name' where id=branch; ident:=branch;
 else raise exception 'Unknown operation';
 end if;
 insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,uid,action,ident,data-'items');
 return jsonb_build_object('id',ident,'ok',true);
end $$;
revoke all on function app_private.command(text,jsonb) from public;
grant execute on function app_private.command(text,jsonb) to authenticated;
create function public.agri_command(action text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app_private.command(action,data) $$;
revoke all on function public.agri_command(text,jsonb) from public,anon;
grant execute on function public.agri_command(text,jsonb) to authenticated;

-- No client can mutate tables directly, even with a valid access token.
do $$ declare t text; begin
 foreach t in array array['organizations','branches','staff_memberships','devices','cashier_shifts','shift_authorizations','products','product_units','unit_prices','product_batches','suppliers','purchase_receipts','sales','sale_items','sale_reversals','payments','stock_transfers','stock_counts','adjustment_approvals','inventory_movements','branch_inventory','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t='organizations' then execute 'create policy org_read on public.organizations for select to authenticated using(app_private.can_access(id,null))';
 elsif t='branches' then execute 'create policy branch_read on public.branches for select to authenticated using(app_private.can_access(organization_id,id))';
 elsif t='staff_memberships' then execute 'create policy member_read on public.staff_memberships for select to authenticated using(user_id=auth.uid() or app_private.can_access(organization_id,branch_id))';
 elsif t='stock_transfers' then execute 'create policy transfer_read on public.stock_transfers for select to authenticated using(app_private.can_access(organization_id,branch_id) or app_private.can_access(organization_id,destination_branch_id))';
 elsif t in ('products','product_units','unit_prices','product_batches','suppliers','sale_items','shift_authorizations') then
  if t='sale_items' then execute 'create policy items_read on public.sale_items for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id and app_private.can_checkout(s.organization_id,s.branch_id)))';
  elsif t='shift_authorizations' then execute 'create policy authz_read on public.shift_authorizations for select to authenticated using(exists(select 1 from public.cashier_shifts s where s.id=shift_id and app_private.can_access(s.organization_id,s.branch_id)))';
  else execute format('create policy org_read on public.%I for select to authenticated using(app_private.can_access(organization_id,null))',t); end if;
 elsif t in ('sales','payments','sale_reversals','cashier_shifts') then execute format('create policy cash_read on public.%I for select to authenticated using(app_private.can_checkout(organization_id,branch_id))',t);
 else execute format('create policy branch_read on public.%I for select to authenticated using(app_private.can_access(organization_id,branch_id))',t); end if;
 end loop;
end $$;
revoke all on all functions in schema app_private from public;
revoke all on all sequences in schema public from anon,authenticated;
