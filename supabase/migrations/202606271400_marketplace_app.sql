-- แยกระบบ "ขายออนไลน์หลายแพลตฟอร์ม" เป็นแอปหลักของตัวเอง (ช่องทางขาย)
-- ทำผ่าน config ล้วน: สร้างแอปใน erp_app_groups + ย้ายป้ายแอป (app_keys) ของ 5 หน้าเข้าแอปใหม่
-- ไม่ย้ายไฟล์/ไม่เปลี่ยน path — หน้าเดิมทำงานเหมือนเดิม

-- 1) แอปใหม่ (หน้าแรก = แดชบอร์ด) · คุมการเห็นด้วยสิทธิ์ products.platforms.view
insert into public.erp_app_groups (key, label, icon, sort_order, permission_key, is_active, theme_color, default_href)
select 'marketplace', 'ช่องทางขาย', '🏬', 58, 'products.platforms.view', true, '#7c3aed', '/master/platform-dashboard'
where not exists (select 1 from public.erp_app_groups g where g.key = 'marketplace');

-- 2) ย้ายเมนู platform เข้าแอป marketplace + จัดหมวดใหม่ (ออกจากแอป master)
update public.erp_menu_items set app_keys = array['marketplace']::text[], section = 'ภาพรวม',        section_order = 10, sort_order = 10 where href = '/master/platform-dashboard';
update public.erp_menu_items set app_keys = array['marketplace']::text[], section = 'งานขายออนไลน์', section_order = 20, sort_order = 10 where href = '/master/platform-catalog';
update public.erp_menu_items set app_keys = array['marketplace']::text[], section = 'งานขายออนไลน์', section_order = 20, sort_order = 20 where href = '/master/platform-orders';
update public.erp_menu_items set app_keys = array['marketplace']::text[], section = 'ตั้งค่า',        section_order = 30, sort_order = 10 where href = '/admin/platform-accounts';
