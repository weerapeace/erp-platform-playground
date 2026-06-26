-- เมนูลัด: ออเดอร์จากแพลตฟอร์ม (app master, หมวด Master Data)
insert into public.erp_menu_items (label, href, icon, app_keys, section, section_order, sort_order, permission_key)
select * from (values
  ('ออเดอร์จากแพลตฟอร์ม', '/master/platform-orders', '📥', array['master']::text[], 'Master Data ⭐', 20, 27, 'platform_orders.view')
) as v(label, href, icon, app_keys, section, section_order, sort_order, permission_key)
where not exists (select 1 from public.erp_menu_items m where m.href = v.href);
