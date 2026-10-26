export const retainedTables=[
 'app_private.delivery_reversals',
 'suppliers','purchase_receipts','product_batches','app_private.purchase_orders','app_private.purchase_order_lines','app_private.purchase_order_events','app_private.delivery_inspections','app_private.delivery_inspection_lines','app_private.supplier_claim_events',
 'app_private.loss_cost_evidence',
 'organizations','branches','staff_memberships','devices','products','product_units','unit_prices','sales','sale_items','payments','sale_reversals','inventory_movements','branch_inventory','cashier_shifts','shift_authorizations','stock_transfers','stock_holds','stock_issues','stock_exceptions','stock_control_events','audit_events','stock_counts','adjustment_approvals','app_private.blind_counts','app_private.count_observations',
];
export function fingerprintSQL(organizationId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId))throw new Error('Restore evidence requires an organization UUID');
 const queries=retainedTables.map(table=>{
  const relation=table.includes('.')?table:`public.${table}`;
  const scope=table==='app_private.count_observations'
   ? `count_id in(select id from app_private.blind_counts where organization_id='${organizationId}')`
   : `${table==='organizations'?'id':'organization_id'}='${organizationId}'`;
  return `select '${table}' name,jsonb_build_object('rows',count(*),'hash',md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''))) signature from ${relation} t where ${scope}`;
 });
 return `select jsonb_object_agg(name,signature) evidence from (${queries.join(' union all ')}) signatures;`;
}
