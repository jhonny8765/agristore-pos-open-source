-- Reject mistaken requests without approving a stock effect or deleting evidence.
alter table public.stock_issues drop constraint stock_issues_state_check;
alter table public.stock_issues add constraint stock_issues_state_check check(state in ('pending','approved','rejected'));
create trigger rejected_issue_immutable before update or delete on public.stock_issues for each row when(old.state='rejected') execute function app_private.immutable();
create unique index one_stock_issue_rejection on public.stock_control_events(organization_id,source_id) where action='reject_stock_issue';

alter function app_private.command(text,jsonb) rename to command_before_issue_rejection;
revoke all on function app_private.command_before_issue_rejection(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid; uid uuid:=auth.uid();
 ident uuid; issue public.stock_issues; prior public.stock_control_events; actor_name text; note text:=btrim(data->>'reason'); at_time timestamptz;
 result jsonb; rejected jsonb; cursor_at timestamptz; cursor_id uuid;
begin
 if action='approve_stock_issue' then
  -- Preserve existing non-owner errors. Owners acquire the same authorized
  -- branch lock before checking rejection, so approve/reject cannot race.
  if not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=uid and m.role='owner' and m.active) then return app_private.command_before_issue_rejection(action,data);end if;
  perform app_private.command_before_issue_rejection('stock_controls',data);
  if exists(select 1 from public.stock_issues s where s.organization_id=org and s.branch_id=branch and s.id=(data->>'issueId')::uuid and s.state='rejected') then raise exception 'This request was rejected. Submit a new correct request; rejected evidence cannot change stock';end if;
  return app_private.command_before_issue_rejection(action,data);
 elsif action='reject_stock_issue' then
  -- Unchanged session, active membership, branch and stock-role checks also
  -- retain the existing branch transaction lock until this decision commits.
  perform app_private.command_before_issue_rejection('stock_controls',data);
  select m.name into actor_name from public.staff_memberships m where m.organization_id=org and m.user_id=uid and m.role='owner' and m.active;
  if actor_name is null then raise exception 'Only the owner can reject a stock issue' using errcode='42501';end if;
  ident:=(data->>'decisionId')::uuid;
  if ident is null then raise exception 'A permanent stock-issue decision ID is required';end if;
  select * into prior from public.stock_control_events e where e.id=ident;
  if prior.id is not null then
   if prior.organization_id<>org or prior.branch_id<>branch or prior.actor_id<>uid or prior.action<>action or prior.payload<>data then raise exception 'Stock-issue decision ID conflict';end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  select * into issue from public.stock_issues s where s.id=(data->>'issueId')::uuid and s.organization_id=org and s.branch_id=branch for update;
  if issue.id is null then raise exception 'Stock issue not found';end if;
  if issue.state='approved' then raise exception 'Approved stock issues require owner reconciliation, not rejection';end if;
  if issue.state='rejected' then raise exception 'This request was already rejected. Refresh its retained history';end if;
  if length(coalesce(note,'')) not between 3 and 1000 then raise exception 'Record a rejection reason between 3 and 1000 characters';end if;
  at_time:=clock_timestamp();
  update public.stock_issues set state='rejected' where id=issue.id;
  insert into public.stock_control_events values(ident,org,branch,action,issue.id,uid,data,at_time);
  insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details,created_at) values(org,branch,uid,action,ident,jsonb_build_object('issueId',issue.id,'decisionId',ident,'actorName',actor_name,'reason',note,'stockChanged',false),at_time);
  return jsonb_build_object('id',ident,'duplicate',false);
 end if;
 result:=app_private.command_before_issue_rejection(action,data);
 if action<>'stock_controls' then return result;end if;
 if data->'rejectedCursor' is not null and data->'rejectedCursor'<>'null'::jsonb then
  cursor_at:=(data->'rejectedCursor'->>'at')::timestamptz;cursor_id:=(data->'rejectedCursor'->>'id')::uuid;
  if cursor_at is null or cursor_id is null then raise exception 'Invalid rejected-issue position. Refresh stock controls';end if;
 end if;
 select coalesce(jsonb_agg(r.item order by r.at desc,r.event_id desc),'[]'::jsonb) into rejected from(
  select to_jsonb(s)||jsonb_build_object('quantity',s.quantity::text,'product_name',p.name,'base_unit',p.base_unit,'lot',b.lot,'expires_on',b.expires_on,
   'decision_id',e.id,'rejected_at',e.created_at,'rejection_reason',e.payload->>'reason','decided_by',e.actor_id,'decided_name',a.details->>'actorName') item,e.created_at at,e.id event_id
  from public.stock_issues s join public.stock_control_events e on e.organization_id=s.organization_id and e.branch_id=s.branch_id and e.source_id=s.id and e.action='reject_stock_issue'
  join public.products p on p.organization_id=org and p.id=s.product_id
  left join public.product_batches b on b.organization_id=org and b.product_id=p.id and b.id=s.batch_id
  left join lateral(select v.details from public.audit_events v where v.organization_id=org and v.branch_id=branch and v.source_id=e.id and v.action='reject_stock_issue' order by v.id limit 1)a on true
  where s.organization_id=org and s.branch_id=branch and s.state='rejected' and (cursor_at is null or (e.created_at,e.id)<(cursor_at,cursor_id))
  order by e.created_at desc,e.id desc limit 51
 )r;
 return result||jsonb_build_object('rejectedCount',(select count(*) from public.stock_issues s where s.organization_id=org and s.branch_id=branch and s.state='rejected'),
  'rejected',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(rejected) with ordinality where ordinality<=50),'[]'::jsonb),
  'rejectedNext',case when jsonb_array_length(rejected)>50 then jsonb_build_object('at',rejected->49->>'rejected_at','id',rejected->49->>'decision_id') else null end);
end $$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
