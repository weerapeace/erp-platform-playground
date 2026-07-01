-- เมนูลัด: แดชบอร์ดรวมผู้บริหาร (หลายแพลตฟอร์ม) — app master, หมวด Master Data
insert into public.erp_menu_items (label, href, icon, app_keys, section, section_order, sort_order, permission_key)
select * from (values
  ('แดชบอร์ดแพลตฟอร์ม', '/master/platform-dashboard', '📊', array['master']::text[], 'Master Data ⭐', 20, 25, 'products.platforms.view')
) as v(label, href, icon, app_keys, section, section_order, sort_order, permission_key)
where not exists (select 1 from public.erp_menu_items m where m.href = v.href);
