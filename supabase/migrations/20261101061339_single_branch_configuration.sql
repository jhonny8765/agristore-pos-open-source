-- Admin-configured per business; generic installations retain their behavior.
alter table public.branches add column active boolean not null default true;
alter table public.branches add column management_locked boolean not null default false;
create unique index one_locked_active_branch on public.branches(organization_id) where active and management_locked;

create function app_private.guard_branch_configuration() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null and (
  exists(select 1 from public.branches b where b.organization_id=case when TG_OP='DELETE' then OLD.organization_id else NEW.organization_id end and b.active and b.management_locked)
  or (TG_OP='UPDATE' and OLD.management_locked)
 ) then
  raise exception 'Branch configuration is fixed. Contact your service provider.' using errcode='42501';
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
revoke all on function app_private.guard_branch_configuration() from public,anon,authenticated;
create trigger guard_branch_configuration before insert or update or delete on public.branches for each row execute function app_private.guard_branch_configuration();
alter policy branch_read on public.branches using(active and app_private.can_access(organization_id,id));

create function app_private.require_enabled_branch(action text,data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid;
begin
 if not exists(select 1 from public.branches b where b.organization_id=org and b.active and b.management_locked) then return; end if;
 if not app_private.can_access(org,null) then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
 if action in ('create_branch','rename_branch') then raise exception 'Branch configuration is fixed. Contact your service provider.' using errcode='42501'; end if;
 if branch is not null and not exists(select 1 from public.branches b where b.organization_id=org and b.id=branch and b.active) then
  -- Preserve a read-only acknowledgment of a previously committed original.
  if action='record_sale' and exists(select 1 from public.sales s where s.organization_id=org and s.branch_id=branch and s.id=(data->>'transactionId')::uuid and s.cashier_id=auth.uid() and s.payload=data) then return; end if;
  raise exception 'This branch is no longer enabled. Keep original recovery records and contact your service provider.' using errcode='42501';
 end if;
 if data->>'destinationBranchId' is not null and not exists(select 1 from public.branches b where b.organization_id=org and b.id=(data->>'destinationBranchId')::uuid and b.active) then raise exception 'The destination branch is not enabled.' using errcode='42501'; end if;
 if coalesce((data->>'allBranches')::boolean,false) then raise exception 'Only the configured branch is enabled for this report.' using errcode='42501'; end if;
end $$;
revoke all on function app_private.require_enabled_branch(text,jsonb) from public,anon;
grant execute on function app_private.require_enabled_branch(text,jsonb) to authenticated;
create function app_private.fixed_branch_dashboard(org uuid,branch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not app_private.can_checkout(org,branch) or not exists(select 1 from public.branches b where b.organization_id=org and b.id=branch and b.active and b.management_locked) then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
 return jsonb_build_object(
  'grossSales',(select coalesce(sum(s.total),0) from public.sales s where s.organization_id=org and s.branch_id=branch),
  'transactions',(select count(*) from public.sales s where s.organization_id=org and s.branch_id=branch),
  'refunds',(select -coalesce(sum(p.amount),0) from public.payments p where p.organization_id=org and p.branch_id=branch and p.amount<0),
  'refundRecoveries',(select coalesce(sum(p.amount),0) from public.payments p where p.organization_id=org and p.branch_id=branch and p.refund_correction_id is not null),
  'netRefunds',(select -coalesce(sum(p.amount),0) from public.payments p where p.organization_id=org and p.branch_id=branch and (p.amount<0 or p.refund_correction_id is not null)),
  'inTransit',(select count(*) from public.stock_transfers t where t.organization_id=org and (t.branch_id=branch or t.destination_branch_id=branch) and t.state='in_transit'),
  'pendingCounts',(select count(*) from app_private.blind_counts c where c.organization_id=org and c.branch_id=branch and c.state not in('approved','cancelled'))+(select count(*) from public.stock_counts c where c.organization_id=org and c.branch_id=branch and c.state='pending' and c.count_method='legacy'),
  'openStockExceptions',(select count(*) from public.stock_exceptions e where e.organization_id=org and e.branch_id=branch and e.state='open'),
  'branchTotals',jsonb_build_array(jsonb_build_object('branchId',branch,'total',(select coalesce(sum(s.total),0) from public.sales s where s.organization_id=org and s.branch_id=branch),'lastSync',(select max(d.last_sync) from public.devices d where d.organization_id=org and d.branch_id=branch and d.active)))
 );
end $$;
revoke all on function app_private.fixed_branch_dashboard(uuid,uuid) from public,anon;
grant execute on function app_private.fixed_branch_dashboard(uuid,uuid) to authenticated;
create or replace function public.agri_command(action text,data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 perform app_private.require_enabled_branch(action,data);
 if action in ('create_branch','rename_branch') then return app_private.branch_command(action,data); end if;
 result:=app_private.command(action,data);
 if action='dashboard' and exists(select 1 from public.branches b where b.organization_id=(data->>'organizationId')::uuid and b.id=(data->>'branchId')::uuid and b.active and b.management_locked) then return result||app_private.fixed_branch_dashboard((data->>'organizationId')::uuid,(data->>'branchId')::uuid); end if;
 return result;
end $$;
revoke all on function public.agri_command(text,jsonb) from public,anon;
grant execute on function public.agri_command(text,jsonb) to authenticated;
