-- Read-only worklists: retain every unresolved item beyond the first fifty.
alter function app_private.command(text,jsonb) rename to command_before_stock_control_pages;
revoke all on function app_private.command_before_stock_control_pages(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid;
 result jsonb; holds jsonb; issues jsonb; hold_at timestamptz; hold_id uuid; issue_at timestamptz; issue_id uuid;
begin
 -- The unchanged command chain checks current session, active membership, branch,
 -- and stock-control role before any new read. Other commands retain their behavior.
 result:=app_private.command_before_stock_control_pages(action,data);
 if action<>'stock_controls' then return result; end if;
 if data->'holdCursor' is not null and data->'holdCursor'<>'null'::jsonb then
  hold_at:=(data->'holdCursor'->>'at')::timestamptz; hold_id:=(data->'holdCursor'->>'id')::uuid;
  if hold_at is null or hold_id is null then raise exception 'Invalid held-goods position. Refresh stock controls'; end if;
 end if;
 if data->'issueCursor' is not null and data->'issueCursor'<>'null'::jsonb then
  issue_at:=(data->'issueCursor'->>'at')::timestamptz; issue_id:=(data->'issueCursor'->>'id')::uuid;
  if issue_at is null or issue_id is null then raise exception 'Invalid stock-issue position. Refresh stock controls'; end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('quantity',h.quantity::text,'remaining',h.remaining::text) order by h.created_at,h.id),'[]'::jsonb) into holds
 from(select * from public.stock_holds h where h.organization_id=org and h.branch_id=branch and h.remaining>0
  and (hold_at is null or (h.created_at,h.id)>(hold_at,hold_id)) order by h.created_at,h.id limit 51)h;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('quantity',s.quantity::text) order by s.created_at,s.id),'[]'::jsonb) into issues
 from(select * from public.stock_issues s where s.organization_id=org and s.branch_id=branch and s.state='pending'
  and (issue_at is null or (s.created_at,s.id)>(issue_at,issue_id)) order by s.created_at,s.id limit 51)s;
 return result||jsonb_build_object(
  'holdCount',(select count(*) from public.stock_holds h where h.organization_id=org and h.branch_id=branch and h.remaining>0),
  'issueCount',(select count(*) from public.stock_issues s where s.organization_id=org and s.branch_id=branch and s.state='pending'),
  'holds',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(holds) with ordinality where ordinality<=50),'[]'::jsonb),
  'holdsNext',case when jsonb_array_length(holds)>50 then jsonb_build_object('at',holds->49->>'created_at','id',holds->49->>'id') else null end,
  'issues',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(issues) with ordinality where ordinality<=50),'[]'::jsonb),
  'issuesNext',case when jsonb_array_length(issues)>50 then jsonb_build_object('at',issues->49->>'created_at','id',issues->49->>'id') else null end);
end $$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
