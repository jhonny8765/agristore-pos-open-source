-- Measured rope uses metres as its canonical stock quantity. Liquid stock remains litres.
alter table public.products drop constraint products_base_unit_check;
alter table public.products add constraint products_base_unit_check check(base_unit in ('kg','liter','meter','piece'));
