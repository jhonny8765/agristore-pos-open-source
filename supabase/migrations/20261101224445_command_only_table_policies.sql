-- These private tables are intentionally accessible only through authorized
-- SECURITY DEFINER commands. Retain their existing grants, ownership and RLS.
-- A restrictive denial also survives an accidentally added permissive policy.
do $$declare t text;
begin
 foreach t in array array['blind_counts','count_observations','delivery_inspection_lines','delivery_inspections','delivery_reversals','loss_cost_evidence','partial_refund_lines','purchase_order_events','purchase_order_lines','purchase_orders','refund_correction_replacements','supplier_claim_events'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname=t and c.relrowsecurity) then raise exception 'Command-only table % must already have RLS enabled',t;end if;
  execute format('create policy command_only on app_private.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
  execute format('comment on policy command_only on app_private.%I is %L',t,'No direct client access. Use session/role/branch-authorized commands; private table owners retain existing command access.');
 end loop;
end$$;
