-- Cover the composite supplier foreign key independently of the branch/document index.
create index delivery_inspection_supplier on app_private.delivery_inspections(organization_id,supplier_id);
