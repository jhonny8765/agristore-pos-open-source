-- Purchasing records are private, append-only evidence. Only authorized commands write stock.
create table app_private.purchase_orders (
 id uuid primary key, organization_id uuid not null references public.organizations, branch_id uuid not null,
 supplier_id uuid not null, reference text not null check(length(reference) between 3 and 200), expected_on date,
 reason text not null, created_by uuid not null references auth.users, created_at timestamptz not null default clock_timestamp(), payload jsonb not null,
 unique(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,supplier_id) references public.suppliers(organization_id,id)
);
create unique index purchase_order_reference on app_private.purchase_orders(organization_id,branch_id,lower(btrim(reference)));
create index purchase_order_work on app_private.purchase_orders(organization_id,branch_id,created_at desc,id);
create index purchase_order_supplier on app_private.purchase_orders(organization_id,supplier_id);
create index purchase_order_actor on app_private.purchase_orders(created_by);
create table app_private.purchase_order_lines (
 id uuid primary key, organization_id uuid not null, order_id uuid not null, line_no integer not null,
 product_id uuid not null, unit_id uuid not null, product_name text not null, unit_name text not null, base_unit text not null,
 factor numeric(20,6) not null, quantity numeric(20,6) not null check(quantity>0), base_quantity numeric(20,6) not null check(base_quantity>0),
 unique(organization_id,id), unique(order_id,line_no), foreign key(organization_id,order_id) references app_private.purchase_orders(organization_id,id),
 foreign key(organization_id,product_id) references public.products(organization_id,id), foreign key(organization_id,unit_id) references public.product_units(organization_id,id)
);
create index purchase_line_order on app_private.purchase_order_lines(organization_id,order_id);
create index purchase_line_product on app_private.purchase_order_lines(organization_id,product_id);
create index purchase_line_unit on app_private.purchase_order_lines(organization_id,unit_id);
create table app_private.purchase_order_events (
 id uuid primary key, organization_id uuid not null, branch_id uuid not null, order_id uuid not null,
 action text not null check(action in ('approve','close','cancel')), reason text not null, actor_id uuid not null references auth.users,
 revision integer not null, created_at timestamptz not null default clock_timestamp(), payload jsonb not null,
 unique(order_id,revision), foreign key(organization_id,order_id) references app_private.purchase_orders(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create index purchase_event_order on app_private.purchase_order_events(organization_id,order_id);
create index purchase_event_branch on app_private.purchase_order_events(organization_id,branch_id);
create index purchase_event_actor on app_private.purchase_order_events(actor_id);
create table app_private.delivery_inspections (
 id uuid primary key references public.purchase_receipts, organization_id uuid not null, branch_id uuid not null, supplier_id uuid not null,
 order_id uuid, reference text not null check(length(reference) between 3 and 200), reason text not null,
 created_by uuid not null references auth.users, created_at timestamptz not null default clock_timestamp(), payload jsonb not null,
 unique(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,supplier_id) references public.suppliers(organization_id,id),
 foreign key(organization_id,order_id) references app_private.purchase_orders(organization_id,id)
);
create unique index inspected_supplier_document on app_private.delivery_inspections(organization_id,branch_id,supplier_id,lower(btrim(reference)));
create index delivery_inspection_work on app_private.delivery_inspections(organization_id,branch_id,created_at desc,id);
create index delivery_inspection_order on app_private.delivery_inspections(organization_id,order_id);
create index delivery_inspection_actor on app_private.delivery_inspections(created_by);
create table app_private.delivery_inspection_lines (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, inspection_id uuid not null, order_line_id uuid,
 product_id uuid not null, unit_id uuid not null, batch_id uuid, hold_id uuid references public.stock_holds, line_no integer not null,
 product_name text not null, unit_name text not null, base_unit text not null, factor numeric(20,6) not null,
 document_quantity numeric(20,6) not null check(document_quantity>=0), accepted numeric(20,6) not null check(accepted>=0),
 held numeric(20,6) not null check(held>=0), rejected numeric(20,6) not null check(rejected>=0), reason text not null,
 reported_lot text, reported_expiry date,
 unique(inspection_id,line_no), foreign key(organization_id,inspection_id) references app_private.delivery_inspections(organization_id,id),
 foreign key(organization_id,order_line_id) references app_private.purchase_order_lines(organization_id,id),
 foreign key(organization_id,product_id) references public.products(organization_id,id), foreign key(organization_id,unit_id) references public.product_units(organization_id,id),
 foreign key(organization_id,batch_id) references public.product_batches(organization_id,id)
);
create index inspected_line_header on app_private.delivery_inspection_lines(organization_id,inspection_id);
create index inspected_line_order on app_private.delivery_inspection_lines(organization_id,order_line_id);
create index inspected_line_product on app_private.delivery_inspection_lines(organization_id,product_id);
create index inspected_line_unit on app_private.delivery_inspection_lines(organization_id,unit_id);
create index inspected_line_batch on app_private.delivery_inspection_lines(organization_id,batch_id);
create index inspected_line_hold on app_private.delivery_inspection_lines(hold_id);
create table app_private.supplier_claim_events (
 id uuid primary key, organization_id uuid not null, branch_id uuid not null, inspection_id uuid not null,
 outcome text not null check(outcome in ('progress','credit','returned','replacement','no_claim')), reference text not null check(length(reference) between 3 and 200),
 reason text not null, revision integer not null, actor_id uuid not null references auth.users, created_at timestamptz not null default clock_timestamp(), payload jsonb not null,
 unique(inspection_id,revision), foreign key(organization_id,inspection_id) references app_private.delivery_inspections(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create index supplier_claim_inspection on app_private.supplier_claim_events(organization_id,inspection_id);
create index supplier_claim_branch on app_private.supplier_claim_events(organization_id,branch_id);
create index supplier_claim_actor on app_private.supplier_claim_events(actor_id);
do $$declare t text;begin
 foreach t in array array['purchase_orders','purchase_order_lines','purchase_order_events','delivery_inspections','delivery_inspection_lines','supplier_claim_events'] loop
  execute format('alter table app_private.%I enable row level security',t);
  execute format('revoke all on app_private.%I from public,anon,authenticated',t);
  execute format('create trigger immutable_history before update or delete on app_private.%I for each row execute function app_private.immutable()',t);
 end loop;
end$$;

create function app_private.purchasing_quantity(value text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if coalesce(value,'')!~'^[0-9]{1,14}(\.[0-9]{1,6})?$' then raise exception 'Enter a nonnegative quantity with at most six decimals';end if;
 return value::numeric;
end$$;
revoke all on function app_private.purchasing_quantity(text) from public,anon,authenticated;
create function app_private.order_line_balance(org uuid,line_id uuid)
returns table(accepted text,held text,rejected text,returned_or_disposed text,remaining text) language sql stable set search_path='' as $$
 select trim_scale(coalesce(sum(x.accepted*x.factor+coalesce(e.released,0)),0))::text,
 trim_scale(coalesce(sum(h.remaining),0))::text,trim_scale(coalesce(sum(x.rejected*x.factor),0))::text,trim_scale(coalesce(sum(e.removed),0))::text,
 trim_scale((l.base_quantity-coalesce(sum(x.accepted*x.factor+coalesce(e.released,0)+coalesce(h.remaining,0)),0)))::text
 from app_private.purchase_order_lines l left join app_private.delivery_inspection_lines x on x.organization_id=org and x.order_line_id=l.id
 left join public.stock_holds h on h.id=x.hold_id and h.organization_id=org
 left join lateral(select sum((v.payload->>'quantity')::numeric) filter(where v.payload->>'disposition'='release') released,
 sum((v.payload->>'quantity')::numeric) filter(where v.payload->>'disposition' in ('dispose','supplier_return')) removed
 from public.stock_control_events v where v.organization_id=org and v.source_id=h.id and v.action='disposition_hold')e on true
 where l.organization_id=org and l.id=line_id group by l.base_quantity
$$;
revoke all on function app_private.order_line_balance(uuid,uuid) from public,anon,authenticated;

alter function app_private.command(text,jsonb) rename to command_before_purchasing;
revoke all on function app_private.command_before_purchasing(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid();org uuid:=(data->>'organizationId')::uuid;branch uuid:=(data->>'branchId')::uuid;
 member public.staff_memberships;po app_private.purchase_orders;pol app_private.purchase_order_lines;prior_order app_private.purchase_orders;
 previous_event app_private.purchase_order_events;previous_delivery app_private.delivery_inspections;previous_claim app_private.supplier_claim_events;
 prod public.products;un public.product_units;exception public.stock_exceptions;
 ident uuid;v_order_id uuid;batch uuid;hold_id uuid;line_id uuid;supplier uuid;item jsonb;n integer:=0;
 q numeric;dq numeric;aq numeric;hq numeric;rq numeric;factor numeric;remaining numeric;
 state text;note text:=btrim(data->>'reason');v_reference text:=btrim(data->>'reference');outcome text;
 v_lot text;expiry date;has_difference boolean:=false;rev integer;orders jsonb;deliveries jsonb;history jsonb;cursor_at timestamptz;cursor_id uuid;
begin
 if action not in ('create_purchase_order','purchase_order_event','inspect_delivery','record_delivery_claim','purchasing_workspace','delivery_claim_history','resolve_stock_exception','receive_stock') then return app_private.command_before_purchasing(action,data);end if;
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=uid and (s.not_after is null or s.not_after>now())) then raise exception 'Sign in again before purchasing' using errcode='42501';end if;
 select * into member from public.staff_memberships m where m.organization_id=org and m.user_id=uid and m.active and (m.role='owner' or m.branch_id=branch) order by (m.role='owner') desc limit 1 for share;
 if member.id is null or branch is null or not exists(select 1 from public.branches b where b.organization_id=org and b.id=branch) then raise exception 'You do not have access to this branch' using errcode='42501';end if;
 if member.role not in ('owner','manager','stock_staff') then raise exception 'Purchasing requires owner, manager or stock staff access' using errcode='42501';end if;
 if action='resolve_stock_exception' then
  if exists(select 1 from app_private.delivery_inspections d where d.organization_id=org and d.branch_id=branch and d.id=(select e.source_id from public.stock_exceptions e where e.id=(data->>'exceptionId')::uuid)) then raise exception 'Resolve this supplier claim in Purchasing with its credit, return or outcome reference';end if;
  return app_private.command_before_purchasing(action,data);
 end if;
 if action='receive_stock' then
  perform pg_advisory_xact_lock(hashtextextended(org::text||branch::text,1));
  if exists(select 1 from public.purchase_receipts r where r.id=(data->>'receiptId')::uuid) then return app_private.command_before_purchasing(action,data);end if;
  if coalesce(data->>'source','purchase')='purchase' then
   if member.role='stock_staff' then raise exception 'Stock staff must inspect an owner-approved purchase order' using errcode='42501';end if;
   if nullif(data->>'supplierId','') is not null and exists(select 1 from public.purchase_receipts r where r.organization_id=org and r.branch_id=branch and r.supplier_id=(data->>'supplierId')::uuid and r.source='purchase' and lower(btrim(r.reference))=lower(v_reference)) then raise exception 'This supplier document is already recorded. Review its original receipt';end if;
  end if;
  return app_private.command_before_purchasing(action,data);
 end if;
 if action='delivery_claim_history' then
  if not exists(select 1 from app_private.delivery_inspections d where d.id=(data->>'receiptId')::uuid and d.organization_id=org and d.branch_id=branch) then raise exception 'Delivery not found';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.revision desc),'[]'::jsonb) into history from(
   select e.id,e.revision,e.outcome,e.reference,e.reason,e.created_at,m.name as actor_name from app_private.supplier_claim_events e left join lateral(select s.name from public.staff_memberships s where s.user_id=e.actor_id and s.organization_id=org limit 1)m on true
   where e.organization_id=org and e.branch_id=branch and e.inspection_id=(data->>'receiptId')::uuid and (nullif(data->>'beforeRevision','') is null or e.revision<(data->>'beforeRevision')::integer) order by e.revision desc limit 51
  )x;
  return jsonb_build_object('rows',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(history) with ordinality where ordinality<=50),'[]'::jsonb),'next',case when jsonb_array_length(history)>50 then history->49->'revision' else null end);
 end if;
 if action='purchasing_workspace' then
  cursor_at:=(data->'orderCursor'->>'at')::timestamptz;cursor_id:=(data->'orderCursor'->>'id')::uuid;
  if data->'orderCursor' is not null and data->'orderCursor'<>'null'::jsonb and (cursor_at is null or cursor_id is null) then raise exception 'Invalid order cursor';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into orders from(
   select p.id,p.reference,p.supplier_id,s.name supplier_name,p.expected_on,p.reason,p.created_at,coalesce(ev.action,'pending') as state,
   coalesce((select jsonb_agg(to_jsonb(z) order by z.line_no) from(select l.id,l.line_no,l.product_id,l.unit_id,l.product_name,l.unit_name,l.base_unit,l.factor::text,l.quantity::text,l.base_quantity::text,b.* from app_private.purchase_order_lines l cross join lateral app_private.order_line_balance(org,l.id)b where l.order_id=p.id)z),'[]'::jsonb) lines,
   coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,'created_at',e.created_at) order by e.revision) from app_private.purchase_order_events e where e.order_id=p.id),'[]'::jsonb) events
   from app_private.purchase_orders p join public.suppliers s on s.organization_id=org and s.id=p.supplier_id
   left join lateral(select e.action from app_private.purchase_order_events e where e.order_id=p.id order by e.revision desc limit 1)ev on true
   where p.organization_id=org and p.branch_id=branch and (cursor_at is null or (p.created_at,p.id)<(cursor_at,cursor_id)) order by p.created_at desc,p.id desc limit 31
  )x;
  cursor_at:=(data->'deliveryCursor'->>'at')::timestamptz;cursor_id:=(data->'deliveryCursor'->>'id')::uuid;
  if data->'deliveryCursor' is not null and data->'deliveryCursor'<>'null'::jsonb and (cursor_at is null or cursor_id is null) then raise exception 'Invalid delivery cursor';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into deliveries from(
   select d.id,d.reference,d.supplier_id,s.name supplier_name,d.order_id,p.reference order_reference,d.reason,d.created_at,e.id exception_id,e.state claim_state,
   coalesce((select max(c.revision) from app_private.supplier_claim_events c where c.inspection_id=d.id),0) claim_version,
   coalesce((select jsonb_agg(to_jsonb(z) order by z.line_no) from(select l.id,l.line_no,l.product_id,l.product_name,l.unit_name,l.base_unit,l.factor::text,l.document_quantity::text,l.accepted::text,l.held::text,l.rejected::text,l.reason,l.hold_id,coalesce(h.remaining,0)::text held_remaining,coalesce(b.lot,l.reported_lot) as lot,coalesce(b.expires_on,l.reported_expiry) as expires_on from app_private.delivery_inspection_lines l left join public.stock_holds h on h.id=l.hold_id left join public.product_batches b on b.id=l.batch_id where l.inspection_id=d.id)z),'[]'::jsonb) lines
   from app_private.delivery_inspections d join public.suppliers s on s.organization_id=org and s.id=d.supplier_id left join app_private.purchase_orders p on p.id=d.order_id
   left join public.stock_exceptions e on e.organization_id=org and e.branch_id=branch and e.kind='delivery_difference' and e.source_id=d.id
   where d.organization_id=org and d.branch_id=branch and (cursor_at is null or (d.created_at,d.id)<(cursor_at,cursor_id)) order by d.created_at desc,d.id desc limit 31
  )x;
  return jsonb_build_object('asOf',clock_timestamp(),'orders',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(orders) with ordinality where ordinality<=30),'[]'::jsonb),'orderNext',case when jsonb_array_length(orders)>30 then jsonb_build_object('at',orders->29->>'created_at','id',orders->29->>'id') else null end,
   'deliveries',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(deliveries) with ordinality where ordinality<=30),'[]'::jsonb),'deliveryNext',case when jsonb_array_length(deliveries)>30 then jsonb_build_object('at',deliveries->29->>'created_at','id',deliveries->29->>'id') else null end);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||branch::text,1));
 if length(coalesce(note,'')) not between 3 and 1000 then raise exception 'Record an explanation of 3 to 1000 characters';end if;
 if action='create_purchase_order' then
  ident:=(data->>'purchaseOrderId')::uuid;
  if ident is null then raise exception 'A permanent purchase order ID is required';end if;
  select * into prior_order from app_private.purchase_orders p where p.id=ident;
  if prior_order.id is not null then
   if prior_order.organization_id<>org or prior_order.branch_id<>branch or prior_order.created_by<>uid or prior_order.payload<>data then raise exception 'Purchase order ID conflict';end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  supplier:=(data->>'supplierId')::uuid;
  if not exists(select 1 from public.suppliers s where s.id=supplier and s.organization_id=org) then raise exception 'Select a supplier from this business';end if;
  if length(coalesce(v_reference,'')) not between 3 and 200 then raise exception 'Enter an order reference of 3 to 200 characters';end if;
  if jsonb_typeof(data->'items') is distinct from 'array' or jsonb_array_length(data->'items') not between 1 and 50 then raise exception 'Enter 1 to 50 order lines';end if;
  insert into app_private.purchase_orders(id,organization_id,branch_id,supplier_id,reference,expected_on,reason,created_by,payload) values(ident,org,branch,supplier,v_reference,nullif(data->>'expectedOn','')::date,note,uid,data);
  for item in select value from jsonb_array_elements(data->'items') loop
   n:=n+1;select * into prod from public.products p where p.id=(item->>'productId')::uuid and p.organization_id=org and p.active;
   select * into un from public.product_units u where u.id=(item->>'unitId')::uuid and u.product_id=prod.id and u.organization_id=org;
   if prod.id is null or un.id is null then raise exception 'Choose an active product and its unit';end if;
   q:=app_private.purchasing_quantity(item->>'quantity');
   if q<=0 or scale(trim_scale(q*un.factor))>6 or (prod.base_unit='piece' and q*un.factor<>trunc(q*un.factor)) then raise exception 'Order quantities must be positive, exact and whole for pieces';end if;
   insert into app_private.purchase_order_lines values((item->>'lineId')::uuid,org,ident,n,prod.id,un.id,prod.name,un.name,prod.base_unit,un.factor,q,q*un.factor);
  end loop;
 elsif action='purchase_order_event' then
  if member.role<>'owner' then raise exception 'Only the owner can approve or close purchase orders' using errcode='42501';end if;
  ident:=(data->>'orderEventId')::uuid;v_order_id:=(data->>'purchaseOrderId')::uuid;
  if ident is null then raise exception 'A permanent order event ID is required';end if;
  select * into previous_event from app_private.purchase_order_events e where e.id=ident;
  if previous_event.id is not null then
   if previous_event.organization_id<>org or previous_event.branch_id<>branch or previous_event.actor_id<>uid or previous_event.payload<>data then raise exception 'Order event ID conflict';end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  select * into po from app_private.purchase_orders p where p.id=v_order_id and p.organization_id=org and p.branch_id=branch;
  if po.id is null then raise exception 'Purchase order not found';end if;
  select e.action,e.revision into state,rev from app_private.purchase_order_events e where e.order_id=v_order_id order by e.revision desc limit 1;
  state:=coalesce(state,'pending');outcome:=data->>'outcome';
  if data->>'expectedState' is distinct from state then raise exception 'Purchase order changed. Refresh before approving or closing';end if;
  if not ((outcome='approve' and state='pending') or (outcome='cancel' and state='pending') or (outcome='close' and state='approve')) then raise exception 'Invalid purchase order transition';end if;
  if outcome='close' and exists(select 1 from app_private.purchase_order_lines l cross join lateral app_private.order_line_balance(org,l.id)b where l.order_id=v_order_id and b.held::numeric>0) then raise exception 'Resolve held delivery goods before closing the order';end if;
  insert into app_private.purchase_order_events values(ident,org,branch,v_order_id,outcome,note,uid,coalesce(rev,0)+1,clock_timestamp(),data);
 elsif action='inspect_delivery' then
  ident:=(data->>'receiptId')::uuid;
  if ident is null then raise exception 'A permanent delivery ID is required';end if;
  select * into previous_delivery from app_private.delivery_inspections d where d.id=ident;
  if previous_delivery.id is not null then
   if previous_delivery.organization_id<>org or previous_delivery.branch_id<>branch or previous_delivery.created_by<>uid or previous_delivery.payload<>data then raise exception 'Delivery ID conflict';end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  v_order_id:=nullif(data->>'purchaseOrderId','')::uuid;
  if v_order_id is not null then
   select * into po from app_private.purchase_orders p where p.id=v_order_id and p.organization_id=org and p.branch_id=branch;
   select e.action into state from app_private.purchase_order_events e where e.order_id=v_order_id order by e.revision desc limit 1;
   if po.id is null or state is distinct from 'approve' then raise exception 'Select an owner-approved open purchase order';end if;
   supplier:=po.supplier_id;
   if (data->>'supplierId')::uuid is distinct from supplier then raise exception 'Delivery supplier must match the order';end if;
  else
   if member.role not in ('owner','manager') then raise exception 'Only owner or manager can inspect an unplanned delivery' using errcode='42501';end if;
   supplier:=(data->>'supplierId')::uuid;
   if not exists(select 1 from public.suppliers s where s.id=supplier and s.organization_id=org) then raise exception 'Select a supplier from this business';end if;
  end if;
  if length(coalesce(v_reference,'')) not between 3 and 200 then raise exception 'Enter a supplier document reference of 3 to 200 characters';end if;
  if jsonb_typeof(data->'items') is distinct from 'array' or jsonb_array_length(data->'items') not between 1 and 50 then raise exception 'Enter 1 to 50 inspection lines';end if;
  if exists(select 1 from public.purchase_receipts r where r.organization_id=org and r.branch_id=branch and r.supplier_id=supplier and r.source='purchase' and lower(btrim(r.reference))=lower(v_reference)) then raise exception 'This supplier document is already recorded. Review its original receipt';end if;
  insert into public.purchase_receipts(id,organization_id,branch_id,supplier_id,reference,source,payload,created_by) values(ident,org,branch,supplier,v_reference,'purchase',data,uid);
  insert into app_private.delivery_inspections(id,organization_id,branch_id,supplier_id,order_id,reference,reason,created_by,payload) values(ident,org,branch,supplier,v_order_id,v_reference,note,uid,data);
  for item in select value from jsonb_array_elements(data->'items') loop
   n:=n+1;line_id:=nullif(item->>'orderLineId','')::uuid;
   if v_order_id is not null then
    select * into pol from app_private.purchase_order_lines l where l.id=line_id and l.order_id=v_order_id and l.organization_id=org;
    if pol.id is null or pol.product_id is distinct from (item->>'productId')::uuid or pol.unit_id is distinct from (item->>'unitId')::uuid then raise exception 'Delivery line must match its ordered product and unit';end if;
    factor:=pol.factor;
   else
    if line_id is not null then raise exception 'Unplanned delivery cannot use an order line';end if;
    factor:=null;
   end if;
   select * into prod from public.products p where p.id=(item->>'productId')::uuid and p.organization_id=org;
   select * into un from public.product_units u where u.id=(item->>'unitId')::uuid and u.product_id=prod.id and u.organization_id=org;
   if prod.id is null or un.id is null then raise exception 'Choose a product and its unit from this business';end if;
   factor:=coalesce(factor,un.factor);dq:=app_private.purchasing_quantity(item->>'documentQuantity');aq:=app_private.purchasing_quantity(item->>'accepted');hq:=app_private.purchasing_quantity(item->>'held');rq:=app_private.purchasing_quantity(item->>'rejected');
   if dq+aq+hq+rq<=0 then raise exception 'A delivery line needs documented or physically inspected goods';end if;
   if scale(trim_scale(dq*factor))>6 or scale(trim_scale(aq*factor))>6 or scale(trim_scale(hq*factor))>6 or scale(trim_scale(rq*factor))>6 or (prod.base_unit='piece' and (dq*factor<>trunc(dq*factor) or aq*factor<>trunc(aq*factor) or hq*factor<>trunc(hq*factor) or rq*factor<>trunc(rq*factor))) then raise exception 'Converted delivery quantities must be exact and whole for pieces';end if;
   if length(coalesce(item->>'reason',''))>1000 or length(coalesce(item->>'lot',''))>180 then raise exception 'Keep inspection notes within 1000 characters and lot identifiers within 180';end if;
   if hq>0 or rq>0 or dq<>aq+hq+rq then
    has_difference:=true;
    if length(btrim(coalesce(item->>'reason',''))) not between 3 and 1000 then raise exception 'Explain held, rejected or document-difference quantities';end if;
   end if;
   if aq+hq>0 and not prod.active then raise exception 'Archived goods cannot be added to stock';end if;
   if v_order_id is not null then
    select b.remaining::numeric into remaining from app_private.order_line_balance(org,line_id)b;
    if (aq+hq)*factor>remaining then raise exception 'Accepted and held goods exceed the unreceived order quantity';end if;
   end if;
   v_lot:=nullif(btrim(item->>'lot'),'');expiry:=nullif(item->>'expiresOn','')::date;batch:=null;hold_id:=null;
   if aq+hq>0 then
    if prod.tracks_expiry and (v_lot is null or expiry is null) then raise exception 'Record the lot and expiry for tracked delivered goods';end if;
    if aq>0 and expiry<(now() at time zone 'Asia/Manila')::date then raise exception 'Expired goods cannot be accepted for sale; hold or reject them';end if;
    if v_lot is not null then
     select b.id into batch from public.product_batches b where b.organization_id=org and b.product_id=prod.id and b.lot=v_lot;
     if batch is not null and (select b.expires_on from public.product_batches b where b.id=batch) is distinct from expiry then raise exception 'The existing lot has a different expiry date';end if;
     if batch is null then insert into public.product_batches(organization_id,product_id,lot,expires_on) values(org,prod.id,v_lot,expiry) returning id into batch;end if;
    end if;
    insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,prod.id,batch,(aq+hq)*factor,'purchase',ident,uid);
    if hq>0 then
     hold_id:=gen_random_uuid();
     insert into public.inventory_movements(organization_id,branch_id,product_id,batch_id,quantity,kind,source_id,created_by) values(org,branch,prod.id,batch,-hq*factor,'hold_out',ident,uid);
     insert into public.stock_holds(id,organization_id,branch_id,product_id,batch_id,quantity,remaining,reason,source_id) values(hold_id,org,branch,prod.id,batch,hq*factor,hq*factor,item->>'reason',ident);
    end if;
   end if;
   insert into app_private.delivery_inspection_lines(organization_id,inspection_id,order_line_id,product_id,unit_id,batch_id,hold_id,line_no,product_name,unit_name,base_unit,factor,document_quantity,accepted,held,rejected,reason,reported_lot,reported_expiry)
    values(org,ident,line_id,prod.id,un.id,batch,hold_id,n,prod.name,un.name,prod.base_unit,factor,dq,aq,hq,rq,coalesce(item->>'reason',''),v_lot,expiry);
  end loop;
  if has_difference then insert into public.stock_exceptions(organization_id,branch_id,kind,source_id,details) values(org,branch,'delivery_difference',ident,jsonb_build_object('reference',v_reference,'note',note,'items',data->'items','purchasingInspection',true));end if;
 elsif action='record_delivery_claim' then
  ident:=(data->>'claimEventId')::uuid;
  if ident is null then raise exception 'A permanent claim event ID is required';end if;
  select * into previous_claim from app_private.supplier_claim_events e where e.id=ident;
  if previous_claim.id is not null then
   if previous_claim.organization_id<>org or previous_claim.branch_id<>branch or previous_claim.actor_id<>uid or previous_claim.payload<>data then raise exception 'Claim event ID conflict';end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  select * into exception from public.stock_exceptions e where e.organization_id=org and e.branch_id=branch and e.kind='delivery_difference' and e.source_id=(data->>'receiptId')::uuid for update;
  if exception.id is null or exception.state<>'open' or not exists(select 1 from app_private.delivery_inspections d where d.id=exception.source_id and d.organization_id=org and d.branch_id=branch) then raise exception 'Select an open inspected-delivery claim';end if;
  select coalesce(max(c.revision),0) into rev from app_private.supplier_claim_events c where c.inspection_id=exception.source_id;
  if (data->>'expectedVersion')::integer is distinct from rev then raise exception 'Supplier claim changed. Refresh before recording evidence';end if;
  outcome:=data->>'outcome';
  if outcome is null or outcome not in ('progress','credit','returned','replacement','no_claim') then raise exception 'Choose a claim outcome';end if;
  if outcome<>'progress' and member.role<>'owner' then raise exception 'Only the owner can resolve supplier claims' using errcode='42501';end if;
  if outcome<>'progress' and exists(select 1 from app_private.delivery_inspection_lines l join public.stock_holds h on h.id=l.hold_id where l.inspection_id=exception.source_id and h.remaining>0) then raise exception 'Resolve held goods in Inventory before closing the supplier claim';end if;
  if length(coalesce(v_reference,'')) not between 3 and 200 then raise exception 'Record the supplier claim, credit, return or outcome reference';end if;
  insert into app_private.supplier_claim_events values(ident,org,branch,exception.source_id,outcome,v_reference,note,rev+1,uid,clock_timestamp(),data);
  update public.stock_exceptions e set progress_note=note,progress_at=clock_timestamp(),progress_by=uid,follow_up_version=e.follow_up_version+1,
   state=case when outcome='progress' then 'open' else 'resolved' end,resolution=case when outcome<>'progress' then outcome||': '||v_reference||' - '||note else null end,
   resolved_by=case when outcome<>'progress' then uid else null end,resolved_at=case when outcome<>'progress' then clock_timestamp() else null end where e.id=exception.id;
 end if;
 insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,uid,action,ident,jsonb_build_object('reference',v_reference,'purchaseOrderId',coalesce(v_order_id,(data->>'purchaseOrderId')::uuid),'receiptId',case when action='inspect_delivery' then ident else nullif(data->>'receiptId','')::uuid end));
 return jsonb_build_object('id',ident,'duplicate',false);
end$$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
