-- Branches grow with the business. Existing checkout contracts remain unchanged.
create function app_private.branch_command(action text, data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); org uuid:=(data->>'organizationId')::uuid;
 ident uuid; branch_name text:=btrim(data->>'name'); next_code bigint;
 existing public.branches; prior public.audit_events;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(
  select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid
  and s.user_id=uid and (s.not_after is null or s.not_after>now())
 ) then raise exception 'Sign in again before making online changes' using errcode='42501'; end if;
 perform 1 from public.staff_memberships where organization_id=org and user_id=uid and role='owner' and active for share;
 if not found then raise exception 'Only the owner can manage branches' using errcode='42501'; end if;
 if branch_name is null or length(branch_name) not between 1 and 120 then
  raise exception 'Enter a branch name with 1 to 120 characters';
 end if;
 -- Serialize code allocation across devices in the same organization.
 perform pg_advisory_xact_lock(hashtextextended('branches:'||org::text,0));
 if action='create_branch' then
  ident:=(data->>'newBranchId')::uuid;
  if ident is null then raise exception 'A permanent branch request ID is required'; end if;
  select * into existing from public.branches where id=ident;
  if found then
   select * into prior from public.audit_events ev where ev.organization_id=org and ev.source_id=ident and ev.action='create_branch' order by ev.id limit 1;
   if existing.organization_id=org and prior.actor_id=uid and prior.details=data then
    return jsonb_build_object('id',ident,'duplicate',true);
   end if;
   raise exception 'Branch request ID conflict';
  end if;
  select coalesce(max(substring(code from 2)::bigint),0)+1 into next_code
   from public.branches where organization_id=org and code ~ '^B[0-9]+$';
  insert into public.branches(id,organization_id,name,code) values
   (ident,org,branch_name,'B'||lpad(next_code::text,greatest(2,length(next_code::text)), '0'));
 elsif action='rename_branch' then
  ident:=(data->>'branchId')::uuid;
  update public.branches set name=branch_name where id=ident and organization_id=org;
  if not found then raise exception 'Invalid branch' using errcode='42501'; end if;
 else raise exception 'Unknown branch operation';
 end if;
 insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details)
  values(org,ident,uid,action,ident,data);
 return jsonb_build_object('id',ident,'ok',true);
end $$;
revoke all on function app_private.branch_command(text,jsonb) from public,anon;
grant execute on function app_private.branch_command(text,jsonb) to authenticated;

create or replace function public.agri_command(action text, data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select case when action in ('create_branch','rename_branch')
  then app_private.branch_command(action,data) else app_private.command(action,data) end
$$;
revoke all on function public.agri_command(text,jsonb) from public,anon;
grant execute on function public.agri_command(text,jsonb) to authenticated;
