do $$ declare definition text:=pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure);
begin
 definition:=replace(definition,'sum(amount)','sum(public.payments.amount)');
 definition:=replace(definition,'and amount<0','and public.payments.amount<0');
 execute definition;
end $$;
