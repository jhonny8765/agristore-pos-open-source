-- Exact conversion precision, stable acknowledgments, uncapped report totals, and opening import protection.
create or replace function app_private.command(action text, data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   return jsonb_build_object('transactionId',ident,'status','duplicate','receipt',existing.receipt,'flags',coalesce((select details->'flags' from public.audit_events where source_id=ident and action='record_sale' order by id desc limit 1),to_jsonb(existing.flags)));
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
   if q<=0 or q>=1000000000000 or scale(trim_scale(q))>6 or factor<>un.factor or scale(trim_scale(q*factor))>6 or q*factor>=100000000000000 then raise exception 'Invalid quantity conversion'; end if;
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
 elsif action='dashboard' then
  if member.role='stock_staff' then raise exception 'Sales reports access denied' using errcode='42501'; end if;
  return jsonb_build_object(
   'grossSales',(select coalesce(sum(total),0) from public.sales where organization_id=org and (member.role='owner' or branch_id=branch)),
   'transactions',(select count(*) from public.sales where organization_id=org and (member.role='owner' or branch_id=branch)),
   'refunds',(select -coalesce(sum(amount),0) from public.payments where organization_id=org and amount<0 and (member.role='owner' or branch_id=branch)),
   'inTransit',(select count(*) from public.stock_transfers where organization_id=org and state='in_transit' and (member.role='owner' or branch_id=branch or destination_branch_id=branch)),
   'pendingCounts',(select count(*) from public.stock_counts where organization_id=org and state='pending' and (member.role='owner' or branch_id=branch)),
   'branchTotals',coalesce((select jsonb_agg(jsonb_build_object('branchId',b.id,'total',(select coalesce(sum(s.total),0) from public.sales s where s.branch_id=b.id),'lastSync',(select max(d.last_sync) from public.devices d where d.branch_id=b.id and d.active))) from public.branches b where b.organization_id=org and (member.role='owner' or b.id=branch)),'[]'::jsonb));
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
   if q<=0 or scale(trim_scale(q))>6 then raise exception 'Invalid receiving quantity'; end if;
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

create unique index one_opening_import_per_branch on public.purchase_receipts(organization_id,branch_id) where source='opening';
alter table public.unit_prices add constraint prices_safe_integer check(price<=9007199254740991 and cost<=9007199254740991);
alter table public.cashier_shifts add constraint cash_safe_integer check(opening_cash<=9007199254740991 and (counted_cash is null or counted_cash<=9007199254740991));
