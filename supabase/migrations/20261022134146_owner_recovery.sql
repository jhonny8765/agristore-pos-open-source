do $patch$ declare definition text:=pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure);
begin
 if strpos(definition,$old$organization_name text;$old$)=0 then raise exception 'Recovery migration anchor missing'; end if;
 definition:=replace(definition,$old$organization_name text;$old$,$new$organization_name text; recovery boolean:=false; recovery_owner uuid; recovery_reason text;$new$);
 if strpos(definition,$old$ perform pg_advisory_xact_lock(hashtextextended(org::text||coalesce(branch::text,''),1));$old$)=0 then raise exception 'Recovery migration anchor missing'; end if;
 definition:=replace(definition,$old$ perform pg_advisory_xact_lock(hashtextextended(org::text||coalesce(branch::text,''),1));$old$,$new$ perform pg_advisory_xact_lock(hashtextextended(org::text||coalesce(branch::text,''),1));
 if action='recover_sale' then
  if member.role<>'owner' or length(trim(coalesce(data->>'reason','')))<3 then raise exception 'Owner approval and a recovery reason are required' using errcode='42501'; end if;
  recovery_owner:=uid; recovery_reason:=data->>'reason'; data:=data->'sale';
  if (data->>'organizationId')::uuid is distinct from org or (data->>'branchId')::uuid is distinct from branch then raise exception 'Recovery belongs to another branch' using errcode='42501'; end if;
  uid:=(data->>'cashierId')::uuid; recovery:=true; flags:=array['owner_recovered']; action:='record_sale';
 end if;$new$);
 if strpos(definition,$old$sh.id is null or sh.closed_at is not null or sh.device_id$old$)=0 then raise exception 'Recovery migration anchor missing'; end if;
 definition:=replace(definition,$old$sh.id is null or sh.closed_at is not null or sh.device_id$old$,$new$sh.id is null or (sh.closed_at is not null and not recovery) or sh.device_id$new$);
 if strpos(definition,$old$if not exists(select 1 from public.devices where id=sh.device_id and active) then$old$)=0 then raise exception 'Recovery migration anchor missing'; end if;
 definition:=replace(definition,$old$if not exists(select 1 from public.devices where id=sh.device_id and active) then$old$,$new$if not recovery and not exists(select 1 from public.devices where id=sh.device_id and active) then$new$);
 if strpos(definition,$old$  return jsonb_build_object('transactionId',ident,'status','created','receipt',receipt,'flags',flags);$old$)=0 then raise exception 'Recovery migration anchor missing'; end if;
 definition:=replace(definition,$old$  return jsonb_build_object('transactionId',ident,'status','created','receipt',receipt,'flags',flags);$old$,$new$  if recovery then
   if sh.closed_at is not null then update public.cashier_shifts s set expected_cash=s.opening_cash+(select coalesce(sum(p.amount),0) from public.payments p where p.shift_id=sh.id) where s.id=sh.id; end if;
   insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,recovery_owner,'approve_recovered_sale',ident,jsonb_build_object('reason',recovery_reason,'original_cashier',uid));
  end if;
  return jsonb_build_object('transactionId',ident,'status','created','receipt',receipt,'flags',flags);$new$);
 if strpos(definition,$old$ elsif action='staff_access' then$old$)=0 then raise exception 'Recovery migration anchor missing'; end if;
 definition:=replace(definition,$old$ elsif action='staff_access' then$old$,$new$ elsif action='retire_device' then
  if member.role<>'owner' or length(trim(coalesce(data->>'reason','')))<3 then raise exception 'Owner approval and a retirement reason are required' using errcode='42501'; end if;
  select * into dev from public.devices where id=(data->>'deviceId')::uuid and organization_id=org and branch_id=branch for update;
  if dev.id is null then raise exception 'Device not found'; end if;
  update public.devices set active=false where id=dev.id;
  update public.cashier_shifts s set closed_at=now(),counted_cash=(data->>'countedCash')::bigint,expected_cash=s.opening_cash+(select coalesce(sum(p.amount),0) from public.payments p where p.shift_id=s.id) where s.device_id=dev.id and s.closed_at is null;
  ident:=dev.id;
 elsif action='staff_access' then$new$);
 execute definition;
end $patch$;
create or replace function app_private.can_access(org uuid,branch uuid default null) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())) and exists(select 1 from public.staff_memberships m where m.user_id=auth.uid() and m.organization_id=org and m.active and (m.role='owner' or branch is null or m.branch_id=branch)) $$;
create or replace function app_private.can_checkout(org uuid,branch uuid) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())) and exists(select 1 from public.staff_memberships m where m.user_id=auth.uid() and m.organization_id=org and m.active and (m.role='owner' or(m.branch_id=branch and m.role in('cashier','manager')))) $$;
