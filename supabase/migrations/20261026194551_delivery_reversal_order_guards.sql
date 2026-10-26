-- Preserve deliberate partial order closures and reject stale order previews.
do $patch$declare d text:=pg_get_functiondef('app_private.delivery_reversal_plan(uuid,uuid,uuid)'::regprocedure);begin
 if strpos(d,'v_state text;v_effects jsonb;')=0 or strpos(d,'select e.action into v_state')=0 or strpos(d,$old$'orderId',v_delivery.order_id,'reopensOrder'$old$)=0 then raise exception 'Reversal plan order guard anchors missing';end if;
 d:=replace(d,'v_state text;v_effects jsonb;','v_state text;v_order_version integer:=0;v_partial_closure boolean:=false;v_effects jsonb;');
 d:=replace(d,'select e.action into v_state','select e.action,e.revision into v_state,v_order_version');
 d:=replace(d,$old$ end if;
 return jsonb_build_object('receiptId'$old$,$new$  v_partial_closure:=v_state='close' and exists(select 1 from app_private.delivery_inspection_lines l where l.inspection_id=v_receipt and l.accepted+l.held>0)
   and exists(select 1 from app_private.purchase_order_lines l cross join lateral app_private.order_line_balance(v_org,l.id) b where l.organization_id=v_org and l.order_id=v_delivery.order_id and b.remaining::numeric>0);
  if v_partial_closure then v_reasons:=array_append(v_reasons,'This order was closed with an unreceived remainder. Owner reconciliation is required to avoid reviving cancelled quantities.');end if;
 end if;
 return jsonb_build_object('receiptId'$new$);
 d:=replace(d,$old$'orderId',v_delivery.order_id,'reopensOrder',coalesce(v_state='close' and exists$old$,$new$'orderId',v_delivery.order_id,'orderVersion',coalesce(v_order_version,0),'reopensOrder',coalesce(v_state='close' and not v_partial_closure and exists$new$);
 if strpos(d,'if v_partial_closure then')=0 then raise exception 'Partial closure guard was not inserted';end if;
 execute d;
end$patch$;
do $patch$declare d text:=pg_get_functiondef('app_private.command(text,jsonb)'::regprocedure);v_anchor text:=$old$if data->>'expectedLedgerRevision' is distinct from v_plan->>'ledgerRevision' then raise exception 'Branch stock changed after the reversal check. Check it again before confirming';end if;$old$;begin
 if (length(d)-length(replace(d,v_anchor,'')))/length(v_anchor)<>2 then raise exception 'Reversal commit order guard anchors missing';end if;
 d:=replace(d,v_anchor,v_anchor||$new$
  if (data->>'expectedOrderVersion')::integer is distinct from (v_plan->>'orderVersion')::integer then raise exception 'Purchase order changed after the reversal check. Check it again before confirming';end if;$new$);
 execute d;
end$patch$;
