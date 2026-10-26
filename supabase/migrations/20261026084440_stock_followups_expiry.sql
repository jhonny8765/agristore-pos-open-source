-- Follow-up metadata never changes physical quantities or closes an investigation.
alter table public.stock_exceptions
 add column assigned_user_id uuid references auth.users,
 add column due_on date,
 add column assignment_note text,
 add column follow_up_version integer not null default 0 check(follow_up_version>=0),
 add column progress_note text,
 add column progress_at timestamptz,
 add column progress_by uuid references auth.users;
create index exception_due_work on public.stock_exceptions(organization_id,branch_id,due_on,created_at,id) where state='open';
create index exception_assignee_work on public.stock_exceptions(assigned_user_id,organization_id,branch_id) where state='open';
create index exception_assigned_actor on public.stock_exceptions(assigned_user_id);
create index exception_progress_actor on public.stock_exceptions(progress_by);

create function app_private.expiry_stock(org uuid,branch uuid,today date,horizon integer)
returns table(product_id uuid,batch_id uuid,product_name text,sku text,base_unit text,lot text,expires_on date,saleable text,held text,days_left integer,status text)
language sql stable set search_path='' as $$
 with physical as (
  select s.product_id,s.batch_id,s.quantity as saleable,0::numeric as held from public.branch_inventory s where s.organization_id=org and s.branch_id=branch
  union all
  select h.product_id,h.batch_id,0::numeric,h.remaining from public.stock_holds h where h.organization_id=org and h.branch_id=branch and h.remaining>0
 ), balances as (select p.product_id,p.batch_id,sum(p.saleable) as saleable,sum(p.held) as held from physical p group by p.product_id,p.batch_id)
 select p.id,b.id,p.name,p.sku,p.base_unit,coalesce(b.lot,'No lot recorded'),b.expires_on,s.saleable::text,s.held::text,b.expires_on-today,
  case when b.expires_on is null then 'missing' when b.expires_on<today then 'expired' when b.expires_on=today then 'today' else 'soon' end
 from balances s join public.products p on p.id=s.product_id and p.organization_id=org
 left join public.product_batches b on b.id=s.batch_id and b.organization_id=org and b.product_id=p.id
 where (s.saleable>0 or s.held>0) and (p.tracks_expiry or b.expires_on is not null) and (b.expires_on is null or b.expires_on<=today+horizon)
$$;
revoke all on function app_private.expiry_stock(uuid,uuid,date,integer) from public,anon,authenticated;

alter function app_private.command(text,jsonb) rename to command_before_followups;
revoke all on function app_private.command_before_followups(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid;
 member public.staff_memberships; assignee public.staff_memberships; issue public.stock_exceptions; prior public.stock_control_events;
 today date:=timezone('Asia/Manila',now())::date; horizon integer:=coalesce((data->>'horizonDays')::integer,30);
 filter text:=coalesce(data->>'filter','all'); expiry_filter text:=coalesce(data->>'expiryFilter','all');
 cursor_at timestamptz; cursor_id uuid; expiry_date date; expiry_product uuid; expiry_batch uuid;
 result jsonb; cases jsonb; expiry jsonb; staff jsonb; totals jsonb; expiry_totals jsonb; ident uuid; due date; note text:=btrim(data->>'reason');
begin
 if action not in ('stock_followups','assign_stock_exception','note_stock_exception') then return app_private.command_before_followups(action,data); end if;
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(
  select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=uid and (s.not_after is null or s.not_after>now())
 ) then raise exception 'Sign in again before making online changes' using errcode='42501'; end if;
 select * into member from public.staff_memberships m where m.organization_id=org and m.user_id=uid and m.active and (m.role='owner' or m.branch_id=branch) order by (m.role='owner') desc limit 1 for share;
 if member.id is null or branch is null or not exists(select 1 from public.branches b where b.id=branch and b.organization_id=org) then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
 if member.role='cashier' then raise exception 'Stock follow-up access denied' using errcode='42501'; end if;
 if action='stock_followups' then
  if horizon not in (7,30,90) or filter not in ('all','overdue','unassigned','mine','due_today') or expiry_filter not in ('all','expired','today','soon','missing') then raise exception 'Choose a valid worklist filter'; end if;
  if data->'cursor' is not null and data->'cursor'<>'null'::jsonb then
   cursor_at:=(data->'cursor'->>'createdAt')::timestamptz; cursor_id:=(data->'cursor'->>'id')::uuid;
   if cursor_at is null or cursor_id is null then raise exception 'Invalid investigation cursor'; end if;
  end if;
  if data->'expiryCursor' is not null and data->'expiryCursor'<>'null'::jsonb then
   expiry_date:=(data->'expiryCursor'->>'date')::date; expiry_product:=(data->'expiryCursor'->>'productId')::uuid; expiry_batch:=(data->'expiryCursor'->>'batchKey')::uuid;
   if expiry_date is null or expiry_product is null or expiry_batch is null then raise exception 'Invalid expiry cursor'; end if;
  end if;
  select jsonb_build_object('open',count(*),'overdue',count(*) filter(where e.due_on<today),'dueToday',count(*) filter(where e.due_on=today),'unassigned',count(*) filter(where not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=e.assigned_user_id and m.active and m.role<>'cashier' and (m.role='owner' or m.branch_id=branch)))) into totals
   from public.stock_exceptions e where e.organization_id=org and e.branch_id=branch and e.state='open';
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'::jsonb) into cases from (
   select s.*,exists(select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=s.assigned_user_id and m.active and m.role<>'cashier' and (m.role='owner' or m.branch_id=branch)) as assignee_active
   from public.stock_exceptions s where s.organization_id=org and s.branch_id=branch and s.state='open'
    and (cursor_at is null or (s.created_at,s.id)>(cursor_at,cursor_id))
    and (filter='all' or (filter='overdue' and s.due_on<today) or (filter='due_today' and s.due_on=today) or (filter='mine' and s.assigned_user_id=uid)
     or (filter='unassigned' and not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.user_id=s.assigned_user_id and m.active and m.role<>'cashier' and (m.role='owner' or m.branch_id=branch))))
   order by s.created_at,s.id limit 51
  ) e;
  select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'name',m.name,'role',m.role) order by m.name,m.user_id),'[]'::jsonb) into staff from public.staff_memberships m
   where m.organization_id=org and m.active and m.role<>'cashier' and (m.role='owner' or m.branch_id=branch);
  select jsonb_build_object('expired',count(*) filter(where e.status='expired'),'today',count(*) filter(where e.status='today'),'soon',count(*) filter(where e.status='soon'),'missing',count(*) filter(where e.status='missing')) into expiry_totals from app_private.expiry_stock(org,branch,today,horizon) e;
  select coalesce(jsonb_agg(to_jsonb(e) order by coalesce(e.expires_on,'0001-01-01'::date),e.product_id,coalesce(e.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]'::jsonb) into expiry from (
   select * from app_private.expiry_stock(org,branch,today,horizon) s where (expiry_filter='all' or s.status=expiry_filter)
    and (expiry_date is null or (coalesce(s.expires_on,'0001-01-01'::date),s.product_id,coalesce(s.batch_id,'00000000-0000-0000-0000-000000000000'::uuid))>(expiry_date,expiry_product,expiry_batch))
   order by coalesce(s.expires_on,'0001-01-01'::date),s.product_id,coalesce(s.batch_id,'00000000-0000-0000-0000-000000000000'::uuid) limit 51
  ) e;
  return jsonb_build_object('asOf',now(),'today',today,'totals',totals,'expiryTotals',expiry_totals,'staff',staff,
   'cases',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(cases) with ordinality where ordinality<=50),'[]'::jsonb),
   'next',case when jsonb_array_length(cases)>50 then jsonb_build_object('createdAt',cases->49->>'created_at','id',cases->49->>'id') else null end,
   'expiry',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(expiry) with ordinality where ordinality<=50),'[]'::jsonb),
   'expiryNext',case when jsonb_array_length(expiry)>50 then jsonb_build_object('date',coalesce(expiry->49->>'expires_on','0001-01-01'),'productId',expiry->49->>'product_id','batchKey',coalesce(expiry->49->>'batch_id','00000000-0000-0000-0000-000000000000')) else null end);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||branch::text,1));
 ident:=(data->>'followUpId')::uuid;
 if ident is null then raise exception 'A permanent follow-up request ID is required'; end if;
 select * into prior from public.stock_control_events where id=ident;
 if prior.id is not null then
  if prior.organization_id<>org or prior.branch_id<>branch or prior.actor_id<>uid or prior.action<>action or prior.payload<>data then raise exception 'Follow-up request ID conflict'; end if;
  return jsonb_build_object('id',ident,'duplicate',true);
 end if;
 select * into issue from public.stock_exceptions e where e.id=(data->>'exceptionId')::uuid and e.organization_id=org and e.branch_id=branch for update;
 if issue.id is null then raise exception 'Stock investigation not found'; end if;
 if issue.state<>'open' then raise exception 'This investigation is resolved. Refresh the worklist'; end if;
 if coalesce(data->>'expectedVersion','')!~'^[0-9]{1,9}$' or (data->>'expectedVersion')::integer<>issue.follow_up_version then raise exception 'This follow-up changed. Refresh before editing'; end if;
 if length(coalesce(note,'')) not between 3 and 1000 then raise exception 'Enter follow-up evidence between 3 and 1000 characters'; end if;
 if action='assign_stock_exception' then
  if member.role not in ('owner','manager') then raise exception 'Only an owner or branch manager can assign investigations' using errcode='42501'; end if;
  select * into assignee from public.staff_memberships m where m.organization_id=org and m.user_id=(data->>'assigneeId')::uuid and m.active and m.role<>'cashier' and (m.role='owner' or m.branch_id=branch) order by (m.role='owner') desc limit 1 for share;
  if assignee.id is null then raise exception 'Choose an active stock employee, branch manager or owner for this branch'; end if;
  if coalesce(data->>'dueOn','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a valid follow-up due date'; end if;
  due:=(data->>'dueOn')::date;
  if due not between date '2000-01-01' and date '2100-12-31' then raise exception 'Enter a due date between 2000 and 2100'; end if;
  update public.stock_exceptions set assigned_user_id=assignee.user_id,assigned_to=assignee.name,due_on=due,assignment_note=note,follow_up_version=follow_up_version+1 where id=issue.id;
 else
  if member.role not in ('owner','manager') and issue.assigned_user_id is distinct from uid then raise exception 'Only the assigned employee, branch manager or owner can record progress' using errcode='42501'; end if;
  update public.stock_exceptions set progress_note=note,progress_at=now(),progress_by=uid,follow_up_version=follow_up_version+1 where id=issue.id;
 end if;
 insert into public.stock_control_events values(ident,org,branch,action,issue.id,uid,data,now());
 insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,uid,action,issue.id,data);
 return jsonb_build_object('id',ident,'duplicate',false);
end $$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
