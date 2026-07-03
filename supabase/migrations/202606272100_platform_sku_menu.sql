-- เมนูลัด: สินค้าเราขายที่ไหนบ้าง (มุมกลับ) — แอป marketplace หมวดงานขายออนไลน์
insert into public.erp_menu_items (label, href, icon, app_keys, section, section_order, sort_order, permission_key)
select * from (values
  ('สินค้าเราขายที่ไหนบ้าง', '/master/platform-sku', '🧬', array['marketplace']::text[], 'งานขายออนไลน์', 20, 5, 'products.platforms.view')
) as v(label, href, icon, app_keys, section, section_order, sort_order, permission_key)
where not exists (select 1 from public.erp_menu_items m where m.href = v.href);
