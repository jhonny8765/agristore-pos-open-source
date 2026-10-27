-- Read-only identity/conversion details travel with authorized stock records.
-- A stale local catalog must not turn held ml into unnamed base units or hide
-- an owner's documentary purchase-cost form. No stock or valuation is inferred.
alter function app_private.command(text,jsonb) rename to command_before_stock_record_details;
revoke all on function app_private.command_before_stock_record_details(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=(data->>'organizationId')::uuid; result jsonb; records jsonb; section text;
begin
 -- Reuse all current session, membership, branch, role and snapshot checks.
 result:=app_private.command_before_stock_record_details(action,data);
 if action='stock_controls' then
  foreach section in array array['holds','issues'] loop
   select coalesce(jsonb_agg(x.item||jsonb_build_object('product_name',p.name,'base_unit',p.base_unit,'lot',b.lot,'expires_on',b.expires_on) order by x.n),'[]'::jsonb) into records
   from jsonb_array_elements(result->section) with ordinality x(item,n)
   left join public.products p on p.organization_id=org and p.id=(x.item->>'product_id')::uuid
   left join public.product_batches b on b.organization_id=org and b.product_id=p.id and b.id=(x.item->>'batch_id')::uuid;
   result:=jsonb_set(result,array[section],records);
  end loop;
 elsif action='stock_loss_report' then
  select coalesce(jsonb_agg(x.item||jsonb_build_object('purchase_units',coalesce((
   select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'factor',u.factor::text) order by u.name,u.id)
   from public.product_units u where u.organization_id=org and u.product_id=(x.item->>'product_id')::uuid
  ),'[]'::jsonb)) order by x.n),'[]'::jsonb) into records
  from jsonb_array_elements(result->'rows') with ordinality x(item,n);
  result:=jsonb_set(result,'{rows}',records);
 end if;
 return result;
end $$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
