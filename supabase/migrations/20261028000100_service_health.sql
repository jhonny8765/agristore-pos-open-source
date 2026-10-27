-- Read-only availability probe. No organization, stock or staff data is read.
create function public.agri_service_health() returns boolean
language sql stable security invoker set search_path = ''
as $$
  select pg_catalog.to_regprocedure('public.agri_command(text,jsonb)') is not null
    and pg_catalog.has_function_privilege('authenticated', 'public.agri_command(text,jsonb)', 'EXECUTE');
$$;
revoke all on function public.agri_service_health() from public;
grant execute on function public.agri_service_health() to anon, authenticated;
