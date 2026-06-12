-- เพิ่ม App "ออกแบบ" บนแถบบน (erp_app_groups) + ผูกเมนู Design Sheets/วัสดุตีราคา + สิทธิ์ app.design
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (add_design_app) 2026-06-11
-- หมายเหตุ: เมนู Design มี app_keys=[] อยู่ → ไม่ขึ้นแถบบน แก้โดยผูก app_keys=['design']
-- ไม่ต้องแก้โค้ด: แถบ App มาจาก DB (erp_app_groups), shell ดึงผ่าน /api/menu/apps (cache 30 วิ)
insert into erp_app_groups (key, label, icon, sort_order, permission_key, is_active)
select 'design', 'ออกแบบ', '🎨', 55, 'app.design', true
where not exists (select 1 from erp_app_groups where key = 'design');

insert into erp_permissions (key, label, category, description, is_dangerous, sort_order)
select 'app.design', 'เข้าแอป: ออกแบบ', 'เข้าถึง App (Apps)', 'เห็นและเข้าใช้แอปออกแบบ (Design Sheets)', false, 925
where not exists (select 1 from erp_permissions where key = 'app.design');

insert into erp_role_permissions (role_key, permission_key)
select r.key, 'app.design' from erp_roles r
where r.active = true and not exists (select 1 from erp_role_permissions rp where rp.role_key = r.key and rp.permission_key = 'app.design');

update erp_menu_items set app_keys = array['design']::text[]
where href in ('/master/design-sheets', '/master/design-price-items');
