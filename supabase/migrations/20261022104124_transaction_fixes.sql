do $$
declare definition text:=pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure);
begin
 definition:=replace(definition,'from public.audit_events where source_id=ident and action=','from public.audit_events ae where ae.source_id=ident and ae.action=');
 definition:=replace(definition,'expected_cash bigint;', 'drawer_expected bigint;');
 definition:=replace(definition,'into expected_cash from public.payments','into drawer_expected from public.payments');
 definition:=replace(definition,'expected_cash=expected_cash,','expected_cash=drawer_expected,');
 definition:=replace(definition,'''expected'',expected_cash,','''expected'',drawer_expected,');
 execute definition;
end $$;
