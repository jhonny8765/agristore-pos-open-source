-- Operational loss valuation uses explicit owner evidence, never current retail prices.
create table app_private.loss_cost_evidence (
 id uuid primary key, organization_id uuid not null references public.organizations,
 branch_id uuid not null, loss_key text not null, product_id uuid not null, batch_id uuid,
 unit_id uuid not null, unit_name text not null, unit_factor numeric(20,6) not null check(unit_factor>0 and unit_factor<>'NaN'::numeric),
 unit_cost bigint not null check(unit_cost>=0), zero_cost_confirmed boolean not null,
 reference text not null check(length(reference) between 3 and 200), reason text not null check(length(reason) between 3 and 1000),
 recorded_by uuid not null references auth.users, recorded_name text not null, payload jsonb not null, revision integer not null check(revision>0), created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,loss_key,revision),
 check(unit_cost>0 or zero_cost_confirmed),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,product_id) references public.products(organization_id,id),
 foreign key(organization_id,batch_id) references public.product_batches(organization_id,id),
 foreign key(organization_id,unit_id) references public.product_units(organization_id,id)
);
alter table app_private.loss_cost_evidence enable row level security;
revoke all on app_private.loss_cost_evidence from public,anon,authenticated;
create trigger loss_cost_immutable before update or delete on app_private.loss_cost_evidence for each row execute function app_private.immutable();
create index loss_cost_latest on app_private.loss_cost_evidence(organization_id,loss_key,revision desc);
create index loss_cost_branch on app_private.loss_cost_evidence(organization_id,branch_id);
create index loss_cost_product on app_private.loss_cost_evidence(organization_id,product_id);
create index loss_cost_batch on app_private.loss_cost_evidence(organization_id,batch_id);
create index loss_cost_unit on app_private.loss_cost_evidence(organization_id,unit_id);
create index loss_cost_actor on app_private.loss_cost_evidence(recorded_by);
create index movements_report_time on public.inventory_movements(organization_id,branch_id,created_at,id);

create function app_private.loss_sources(org uuid,branch uuid,cutoff timestamptz)
returns table(loss_key text,branch_id uuid,product_id uuid,batch_id uuid,recorded_at timestamptz,quantity numeric,category text,bucket text,source_id uuid,reason text,destination_branch_id uuid)
language sql stable set search_path='' as $$
 select 'movement:'||m.id,m.branch_id,m.product_id,m.batch_id,m.created_at,-m.quantity,
  case when m.kind='adjustment' then 'count_shortage' else coalesce(i.category,'other_write_off') end,
  case when i.category in ('staff_use','owner_use','supplier_return') then 'other_removal' else 'loss' end,
  m.source_id,coalesce(i.reason,c.reason,'Recorded negative stock movement'),null::uuid
 from public.inventory_movements m left join public.stock_issues i on i.organization_id=m.organization_id and i.id=m.source_id
 left join public.stock_counts c on c.organization_id=m.organization_id and c.id=m.source_id
 where m.organization_id=org and (branch is null or m.branch_id=branch) and m.created_at<=cutoff and m.kind in ('adjustment','loss') and m.quantity<0
 union all
 select 'held:'||e.id,h.branch_id,h.product_id,h.batch_id,e.created_at,(e.payload->>'quantity')::numeric,
  case when e.payload->>'disposition'='dispose' then 'held_disposal' else 'held_supplier_return' end,
  case when e.payload->>'disposition'='dispose' then 'loss' else 'other_removal' end,
  h.id,e.payload->>'reason',null::uuid
 from public.stock_control_events e join public.stock_holds h on h.id=e.source_id and h.organization_id=e.organization_id
 where e.organization_id=org and (branch is null or h.branch_id=branch) and e.created_at<=cutoff and e.action='disposition_hold' and e.payload->>'disposition' in ('dispose','supplier_return')
 union all
 select 'transfer:'||e.id,t.branch_id,t.product_id,t.batch_id,e.created_at,(e.payload->>'quantity')::numeric,'transfer_shortage','loss',t.id,e.payload->>'reason',t.destination_branch_id
 from public.stock_control_events e join public.stock_transfers t on t.id=e.source_id and t.organization_id=e.organization_id
 where e.organization_id=org and (branch is null or t.branch_id=branch) and e.created_at<=cutoff and e.action='write_off_transfer'
$$;
revoke all on function app_private.loss_sources(uuid,uuid,timestamptz) from public,anon,authenticated;

create function app_private.loss_report_rows(org uuid,branch uuid,cutoff timestamptz,start_at timestamptz,end_at timestamptz)
returns table(loss_key text,branch_id uuid,branch_name text,product_id uuid,product_name text,batch_id uuid,lot text,base_unit text,recorded_at timestamptz,quantity text,category text,bucket text,source_id uuid,reason text,destination_branch_id uuid,
 evidence_id uuid,unit_name text,unit_factor text,unit_cost_centavos text,value_centavos text,reference text,cost_reason text,recorded_name text,cost_recorded_at timestamptz,zero_cost_confirmed boolean)
language sql stable set search_path='' as $$
 select s.loss_key,s.branch_id,b.name,s.product_id,p.name,s.batch_id,coalesce(l.lot,'No lot recorded'),p.base_unit,s.recorded_at,s.quantity::text,s.category,s.bucket,s.source_id,s.reason,s.destination_branch_id,
  c.id,c.unit_name,c.unit_factor::text,c.unit_cost::text,case when c.id is not null then round(s.quantity*c.unit_cost/c.unit_factor)::text end,c.reference,c.reason,c.recorded_name,c.created_at,c.zero_cost_confirmed
 from app_private.loss_sources(org,branch,cutoff) s join public.products p on p.id=s.product_id and p.organization_id=org
 join public.branches b on b.id=s.branch_id and b.organization_id=org left join public.product_batches l on l.id=s.batch_id and l.organization_id=org
 left join lateral(select * from app_private.loss_cost_evidence e where e.organization_id=org and e.loss_key=s.loss_key and e.created_at<=cutoff order by e.revision desc limit 1)c on true
 where (start_at is null or s.recorded_at>=start_at) and (end_at is null or s.recorded_at<end_at)
$$;
revoke all on function app_private.loss_report_rows(uuid,uuid,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;

create function app_private.stock_reconciliation(org uuid,branch uuid,cutoff timestamptz,start_at timestamptz,end_at timestamptz)
returns table(branch_id uuid,branch_name text,product_id uuid,product_name text,batch_id uuid,lot text,base_unit text,balance_start text,opening text,purchases text,sales text,refunds text,transfer_in text,transfer_out text,shortage_adjustments text,surplus_adjustments text,write_offs text,held_out text,held_release text,balance_end text,held_at_end text,in_transit_out text)
language sql stable set search_path='' as $$
 with ledger as (
  select m.branch_id,m.product_id,m.batch_id,
   coalesce(sum(m.quantity) filter(where start_at is not null and m.created_at<start_at),0) as balance_start,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='opening'),0) as opening,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='purchase'),0) as purchases,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='sale'),0) as sales,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='refund'),0) as refunds,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='transfer_in'),0) as transfer_in,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='transfer_out'),0) as transfer_out,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='adjustment' and m.quantity<0),0) as shortage_adjustments,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='adjustment' and m.quantity>0),0) as surplus_adjustments,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='loss'),0) as write_offs,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='hold_out'),0) as held_out,
   coalesce(sum(m.quantity) filter(where (start_at is null or m.created_at>=start_at) and m.kind='hold_release'),0) as held_release,sum(m.quantity) as balance_end
  from public.inventory_movements m where m.organization_id=org and (branch is null or m.branch_id=branch) and m.created_at<=cutoff and (end_at is null or m.created_at<end_at) group by m.branch_id,m.product_id,m.batch_id
 ), held as (
  select h.branch_id,h.product_id,h.batch_id,sum(h.quantity-coalesce((select sum((e.payload->>'quantity')::numeric) from public.stock_control_events e where e.organization_id=org and e.source_id=h.id and e.action='disposition_hold' and e.created_at<=cutoff and (end_at is null or e.created_at<end_at)),0)) as quantity
  from public.stock_holds h where h.organization_id=org and (branch is null or h.branch_id=branch) and h.created_at<=cutoff and (end_at is null or h.created_at<end_at) group by h.branch_id,h.product_id,h.batch_id
 ), transit as (
  select t.branch_id,t.product_id,t.batch_id,sum(t.quantity-case when not exists(select 1 from public.stock_control_events e where e.organization_id=org and e.source_id=t.id and e.action in ('receive_transfer','write_off_transfer')) and t.state='received' and t.received_at<=cutoff and (end_at is null or t.received_at<end_at) then t.quantity else coalesce((select sum(coalesce((e.payload->>'quantity')::numeric,0)+case when e.action='receive_transfer' then coalesce((e.payload->>'heldQuantity')::numeric,0) else 0 end) from public.stock_control_events e where e.organization_id=org and e.source_id=t.id and e.action in ('receive_transfer','write_off_transfer') and e.created_at<=cutoff and (end_at is null or e.created_at<end_at)),0) end) as quantity
  from public.stock_transfers t where t.organization_id=org and (branch is null or t.branch_id=branch) and t.dispatched_at<=cutoff and (end_at is null or t.dispatched_at<end_at) group by t.branch_id,t.product_id,t.batch_id
 ), keys as (select l.branch_id,l.product_id,l.batch_id from ledger l union select h.branch_id,h.product_id,h.batch_id from held h union select t.branch_id,t.product_id,t.batch_id from transit t)
 select k.branch_id,b.name,k.product_id,p.name,k.batch_id,coalesce(lot.lot,'No lot recorded'),p.base_unit,
  coalesce(l.balance_start,0)::text,coalesce(l.opening,0)::text,coalesce(l.purchases,0)::text,coalesce(l.sales,0)::text,coalesce(l.refunds,0)::text,coalesce(l.transfer_in,0)::text,coalesce(l.transfer_out,0)::text,
  coalesce(l.shortage_adjustments,0)::text,coalesce(l.surplus_adjustments,0)::text,coalesce(l.write_offs,0)::text,coalesce(l.held_out,0)::text,coalesce(l.held_release,0)::text,coalesce(l.balance_end,0)::text,coalesce(h.quantity,0)::text,coalesce(t.quantity,0)::text
 from keys k join public.branches b on b.id=k.branch_id and b.organization_id=org join public.products p on p.id=k.product_id and p.organization_id=org
 left join public.product_batches lot on lot.id=k.batch_id and lot.organization_id=org
 left join ledger l on l.branch_id=k.branch_id and l.product_id=k.product_id and l.batch_id is not distinct from k.batch_id
 left join held h on h.branch_id=k.branch_id and h.product_id=k.product_id and h.batch_id is not distinct from k.batch_id
 left join transit t on t.branch_id=k.branch_id and t.product_id=k.product_id and t.batch_id is not distinct from k.batch_id
$$;
revoke all on function app_private.stock_reconciliation(uuid,uuid,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;

alter function app_private.command(text,jsonb) rename to command_before_loss_reports;
revoke all on function app_private.command_before_loss_reports(text,jsonb) from public,anon,authenticated;
create function app_private.command(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); org uuid:=(data->>'organizationId')::uuid; branch uuid:=(data->>'branchId')::uuid; scope_branch uuid;
 member public.staff_memberships; prior app_private.loss_cost_evidence; latest app_private.loss_cost_evidence; source record; unit public.product_units;
 ident uuid; cost bigint; reference text:=btrim(data->>'reference'); note text:=btrim(data->>'reason');
 cutoff timestamptz:=coalesce((data->>'asOf')::timestamptz,clock_timestamp()); start_at timestamptz; end_at timestamptz;
 cursor_at timestamptz; cursor_key text; rec_branch uuid; rec_product uuid; rec_batch uuid;
 filter text:=coalesce(data->>'filter','loss'); results jsonb; reconciled jsonb; totals jsonb; cost_revision integer;
begin
 if action not in ('stock_loss_report','record_loss_cost','loss_cost_history') then return app_private.command_before_loss_reports(action,data); end if;
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=uid and (s.not_after is null or s.not_after>now())) then raise exception 'Sign in again before using cost reports' using errcode='42501'; end if;
 select * into member from public.staff_memberships m where m.organization_id=org and m.user_id=uid and m.active and (m.role='owner' or m.branch_id=branch) order by (m.role='owner') desc limit 1 for share;
 if member.id is null or branch is null or not exists(select 1 from public.branches b where b.organization_id=org and b.id=branch) then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
 if member.role not in ('owner','manager') then raise exception 'Cost reports require an owner or branch manager' using errcode='42501'; end if;
 if cutoff>clock_timestamp() or cutoff<'2000-01-01'::timestamptz then raise exception 'Invalid report snapshot. Refresh the report'; end if;
 scope_branch:=branch;
 if coalesce((data->>'allBranches')::boolean,false) then
  if member.role<>'owner' then raise exception 'Only the owner can report all branches' using errcode='42501'; end if;
  scope_branch:=null;
 end if;
 if action='record_loss_cost' then
  if member.role<>'owner' then raise exception 'Only the owner can record purchase-cost evidence' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||branch::text,1));
  ident:=(data->>'costEvidenceId')::uuid;
  if ident is null then raise exception 'A permanent cost evidence ID is required'; end if;
  select * into prior from app_private.loss_cost_evidence e where e.id=ident;
  if prior.id is not null then
   if prior.organization_id<>org or prior.branch_id<>branch or prior.recorded_by<>uid or prior.payload<>data then raise exception 'Cost evidence ID conflict'; end if;
   return jsonb_build_object('id',ident,'duplicate',true);
  end if;
  select * into source from app_private.loss_sources(org,branch,now()) s where s.loss_key=data->>'lossKey';
  if source.loss_key is null then raise exception 'Select a posted loss or removal from this branch'; end if;
  select * into latest from app_private.loss_cost_evidence e where e.organization_id=org and e.loss_key=source.loss_key order by e.revision desc limit 1;
  if coalesce(data->>'expectedCostId','')<>coalesce(latest.id::text,'') then raise exception 'Purchase-cost evidence changed. Refresh before recording a correction'; end if;
  select * into unit from public.product_units u where u.id=(data->>'unitId')::uuid and u.organization_id=org and u.product_id=source.product_id;
  if unit.id is null then raise exception 'Choose a selling unit belonging to this product'; end if;
  if coalesce(data->>'unitCostCentavos','')!~'^[0-9]{1,16}$' then raise exception 'Enter a valid nonnegative purchase cost in centavos'; end if;
  cost:=(data->>'unitCostCentavos')::bigint;
  if cost>9007199254740991 then raise exception 'Purchase cost exceeds the supported range'; end if;
  if cost=0 and not coalesce((data->>'zeroCostConfirmed')::boolean,false) then raise exception 'Confirm documentary evidence of zero acquisition cost, or leave this loss unvalued'; end if;
  if length(coalesce(reference,'')) not between 3 and 200 or length(coalesce(note,'')) not between 3 and 1000 then raise exception 'Record a source document and cost explanation'; end if;
  insert into app_private.loss_cost_evidence(id,organization_id,branch_id,loss_key,product_id,batch_id,unit_id,unit_name,unit_factor,unit_cost,zero_cost_confirmed,reference,reason,recorded_by,recorded_name,payload,revision)
   values(ident,org,branch,source.loss_key,source.product_id,source.batch_id,unit.id,unit.name,unit.factor,cost,coalesce((data->>'zeroCostConfirmed')::boolean,false),reference,note,uid,member.name,data,coalesce(latest.revision,0)+1);
  insert into public.audit_events(organization_id,branch_id,actor_id,action,source_id,details) values(org,branch,uid,action,ident,jsonb_build_object('lossKey',source.loss_key,'costEvidenceId',ident));
  return jsonb_build_object('id',ident,'duplicate',false);
 end if;
 if action='loss_cost_history' then
  if not exists(select 1 from app_private.loss_sources(org,branch,cutoff) s where s.loss_key=data->>'lossKey') then raise exception 'Loss source not found'; end if;
  if data->'cursor' is not null and data->'cursor'<>'null'::jsonb then
   cost_revision:=(data->'cursor'->>'revision')::integer;
   if cost_revision is null or cost_revision<1 then raise exception 'Invalid cost history position'; end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.revision desc),'[]'::jsonb) into results from(
   select c.id,c.unit_name,c.unit_factor::text,c.unit_cost::text as unit_cost_centavos,c.reference,c.reason,c.recorded_name,c.created_at,c.zero_cost_confirmed,c.revision
   from app_private.loss_cost_evidence c where c.organization_id=org and c.branch_id=branch and c.loss_key=data->>'lossKey' and c.created_at<=cutoff and (cost_revision is null or c.revision<cost_revision) order by c.revision desc limit 51
  )e;
  return jsonb_build_object('rows',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(results) with ordinality where ordinality<=50),'[]'::jsonb),
   'next',case when jsonb_array_length(results)>50 then jsonb_build_object('revision',results->49->'revision') else null end);
 end if;
 if filter not in ('loss','other_removal','all') then raise exception 'Choose a valid removal category'; end if;
 if nullif(data->>'fromDate','') is not null then
  if data->>'fromDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a valid start date'; end if;
  start_at:=(data->>'fromDate')::date::timestamp at time zone 'Asia/Manila';
 end if;
 if nullif(data->>'throughDate','') is not null then
  if data->>'throughDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a valid through date'; end if;
  end_at:=((data->>'throughDate')::date+1)::timestamp at time zone 'Asia/Manila';
 end if;
 if start_at is not null and end_at is not null and start_at>=end_at then raise exception 'Through date must be on or after the start date'; end if;
 if data->'cursor' is not null and data->'cursor'<>'null'::jsonb then
  cursor_at:=(data->'cursor'->>'at')::timestamptz; cursor_key:=data->'cursor'->>'key';
  if cursor_at is null or cursor_key is null then raise exception 'Invalid report position'; end if;
 end if;
 if data->'reconciliationCursor' is not null and data->'reconciliationCursor'<>'null'::jsonb then
  rec_branch:=(data->'reconciliationCursor'->>'branchId')::uuid; rec_product:=(data->'reconciliationCursor'->>'productId')::uuid; rec_batch:=(data->'reconciliationCursor'->>'batchKey')::uuid;
  if rec_branch is null or rec_product is null or rec_batch is null then raise exception 'Invalid stock reconciliation position'; end if;
 end if;
 select jsonb_build_object('lossRows',count(*) filter(where r.bucket='loss'),'missingLossCosts',count(*) filter(where r.bucket='loss' and r.evidence_id is null),
  'documentedLossCentavos',coalesce(sum(r.value_centavos::numeric) filter(where r.bucket='loss'),0)::text,
  'otherRows',count(*) filter(where r.bucket='other_removal'),'missingOtherCosts',count(*) filter(where r.bucket='other_removal' and r.evidence_id is null),
  'documentedOtherCentavos',coalesce(sum(r.value_centavos::numeric) filter(where r.bucket='other_removal'),0)::text) into totals
  from app_private.loss_report_rows(org,scope_branch,cutoff,start_at,end_at) r;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.recorded_at desc,r.loss_key desc),'[]'::jsonb) into results from(
  select * from app_private.loss_report_rows(org,scope_branch,cutoff,start_at,end_at) s where (filter='all' or s.bucket=filter) and (cursor_at is null or (s.recorded_at,s.loss_key)<(cursor_at,cursor_key)) order by s.recorded_at desc,s.loss_key desc limit 51
 ) r;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.branch_id,r.product_id,coalesce(r.batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]'::jsonb) into reconciled from(
  select * from app_private.stock_reconciliation(org,scope_branch,cutoff,start_at,end_at) s where rec_branch is null or (s.branch_id,s.product_id,coalesce(s.batch_id,'00000000-0000-0000-0000-000000000000'::uuid))>(rec_branch,rec_product,rec_batch)
  order by s.branch_id,s.product_id,coalesce(s.batch_id,'00000000-0000-0000-0000-000000000000'::uuid) limit 51
 )r;
 return jsonb_build_object('asOf',cutoff,'fromDate',data->>'fromDate','throughDate',data->>'throughDate','allBranches',scope_branch is null,'filter',filter,'totals',totals,
  'rows',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(results) with ordinality where ordinality<=50),'[]'::jsonb),
  'next',case when jsonb_array_length(results)>50 then jsonb_build_object('at',results->49->>'recorded_at','key',results->49->>'loss_key') else null end,
  'reconciliation',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(reconciled) with ordinality where ordinality<=50),'[]'::jsonb),
  'reconciliationNext',case when jsonb_array_length(reconciled)>50 then jsonb_build_object('branchId',reconciled->49->>'branch_id','productId',reconciled->49->>'product_id','batchKey',coalesce(reconciled->49->>'batch_id','00000000-0000-0000-0000-000000000000')) else null end);
end $$;
revoke all on function app_private.command(text,jsonb) from public,anon;
grant execute on function app_private.command(text,jsonb) to authenticated;
