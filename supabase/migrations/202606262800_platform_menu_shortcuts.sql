-- เมนูลัด: สินค้าบนแพลตฟอร์ม + ร้าน/บัญชีแพลตฟอร์ม (app master, หมวด Master Data)
insert into public.erp_menu_items (label, href, icon, app_keys, section, section_order, sort_order, permission_key)
select * from (values
  ('สินค้าบนแพลตฟอร์ม', '/master/platform-catalog', '🛒', array['master']::text[], 'Master Data ⭐', 20, 25, 'products.platforms.view'),
  ('ร้าน/บัญชีแพลตฟอร์ม', '/admin/platform-accounts', '🏪', array['master']::text[], 'Master Data ⭐', 20, 26, 'products.platforms.manage_accounts')
) as v(label, href, icon, app_keys, section, section_order, sort_order, permission_key)
where not exists (select 1 from public.erp_menu_items m where m.href = v.href);
