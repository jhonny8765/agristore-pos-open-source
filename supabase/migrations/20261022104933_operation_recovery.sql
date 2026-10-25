do $patch$ declare definition text:=pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure);
begin
 definition:=replace(definition,$old$  if exists(select 1 from public.stock_transfers where id=ident) then raise exception 'Transfer already recorded; refresh the list'; end if;$old$,$new$  select * into tr from public.stock_transfers where id=ident;
  if tr.id is not null then
   if tr.organization_id=org and tr.branch_id=branch and tr.dispatched_by=uid and tr.product_id=(data->>'productId')::uuid and tr.batch_id is not distinct from (data->>'batchId')::uuid and tr.destination_branch_id=(data->>'destinationBranchId')::uuid and tr.quantity=(data->>'quantity')::numeric then return jsonb_build_object('id',ident,'duplicate',true); end if;
   raise exception 'Transfer ID conflict';
  end if;$new$);
 definition:=replace(definition,$old$   ident:=(data->>'countId')::uuid; b_id:=(data->>'batchId')::uuid;$old$,$new$   ident:=(data->>'countId')::uuid;
   select * into cnt from public.stock_counts where id=ident;
   if cnt.id is not null then
    if cnt.organization_id=org and cnt.branch_id=branch and cnt.product_id=(data->>'productId')::uuid and cnt.batch_id is not distinct from (data->>'batchId')::uuid and cnt.counted=(data->>'counted')::numeric and cnt.reason=data->>'reason' and cnt.counted_by=uid then return jsonb_build_object('id',ident,'duplicate',true); end if;
    raise exception 'Count ID conflict';
   end if;
   b_id:=(data->>'batchId')::uuid;$new$);
 definition:=replace(definition,$old$  if exists(select 1 from public.sale_reversals where sale_id=existing.id) then raise exception 'This sale has already been refunded'; end if;$old$,$new$  if exists(select 1 from public.sale_reversals where id=(data->>'refundId')::uuid and organization_id=org and sale_id=existing.id and created_by=uid and reason=data->>'reason') then return jsonb_build_object('id',(data->>'refundId')::uuid,'duplicate',true); end if;
  if exists(select 1 from public.sale_reversals where sale_id=existing.id) then raise exception 'This sale has already been refunded'; end if;$new$);
 execute definition;
end $patch$;
