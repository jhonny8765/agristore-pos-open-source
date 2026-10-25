do $patch$ declare definition text:=pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure);
begin
 definition:=replace(definition,$old$ if action='register_device' then$old$,$new$ if action='authorize_shift' then
  return jsonb_build_object('authorized',member.role in ('owner','manager','cashier') and exists(select 1 from public.devices d join public.cashier_shifts s on s.device_id=d.id where d.id=(data->>'deviceId')::uuid and d.organization_id=org and d.branch_id=branch and d.active and s.cashier_id=uid and s.closed_at is null));
 elsif action='register_device' then$new$);
 definition:=replace(definition,$old$scale(q*factor)>6$old$,$new$scale(trim_scale(q*factor))>6$new$);
 definition:=replace(definition,$old$   amount:=round(q*price.price)::bigint;$old$,$new$   if prod.base_unit='piece' and q*factor<>trunc(q*factor) then raise exception 'Piece stock must be a whole number'; end if;
   if row_item->>'name' is distinct from prod.name or row_item->>'unitName' is distinct from un.name then raise exception 'Receipt names must match the catalog'; end if;
   amount:=round(q*price.price)::bigint;$new$);
 definition:=replace(definition,$old$or sum_total>9007199254740991$old$,$new$or sum_total>9007199254740991 or (data->>'cashReceived')::numeric>9007199254740991$new$);
 definition:=replace(definition,$old$if exists(select 1 from public.branch_inventory where organization_id=org and branch_id=branch and quantity<0)$old$,$new$if exists(select 1 from public.branch_inventory i join public.inventory_movements m on m.organization_id=i.organization_id and m.branch_id=i.branch_id and m.product_id=i.product_id and m.batch_id is not distinct from i.batch_id where m.source_id=ident and m.kind='sale' and i.quantity<0)$new$);
 definition:=replace(definition,$old$if factor is null or q<=0 or q>factor$old$,$new$if factor is null or q<=0 or q>factor or scale(trim_scale(q))>6$new$);
 definition:=replace(definition,$old$   b_id:=(data->>'batchId')::uuid;
   select coalesce(max(id),0) into rev$old$,$new$   b_id:=(data->>'batchId')::uuid;
   if (data->>'counted')::numeric<0 or scale(trim_scale((data->>'counted')::numeric))>6 then raise exception 'Invalid count precision'; end if;
   select coalesce(max(id),0) into rev$new$);
 execute definition;
end $patch$;
create index units_product_lookup on public.product_units(product_id);
create index batches_product_lookup on public.product_batches(product_id);
create index sale_items_sale_lookup on public.sale_items(sale_id);
create index audit_source_lookup on public.audit_events(source_id,action,id desc);
create index shifts_branch_lookup on public.cashier_shifts(organization_id,branch_id);
create index counts_branch_lookup on public.stock_counts(organization_id,branch_id,state);
