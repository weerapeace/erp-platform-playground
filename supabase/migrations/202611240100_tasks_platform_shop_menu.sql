-- ============================================================
-- 🛒 สินค้าบนแพลตฟอร์ม (มุมมองหน้าร้าน) — เมนูในแอป "จัดการงาน" (แก้ข้อมูลเมนูอย่างเดียว ไม่แก้โครงตาราง)
-- เจ้าของเลือกแบบ A + กองงาน D (2026-11-08) · หน้าเดิม /master/platform-catalog เปิดด้วย ?view=shop (ไม่ทำหน้าซ้ำ)
-- ============================================================

-- 1) เมนูใหม่ในแอปจัดการงาน → เปิดมุมมองหน้าร้าน
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys, app_overrides)
select '📋 จัดการงาน', 10, 14, '🛒', 'สินค้าบนแพลตฟอร์ม', '/master/platform-catalog?view=shop', true, true, 'products.platforms.view', true, array['tasks'],
       '{"tasks":{"sort":27}}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/master/platform-catalog?view=shop');

-- 2) แถวเดิมของหน้านี้ (แอปช่องทางขาย) ใส่แอปจัดการงานด้วย แต่ "ซ่อน" ในแถบเมนูของแอปจัดการงาน
--    เหตุผล: เชลล์ดูว่า "หน้านี้อยู่แอปไหน" จาก path อย่างเดียว (ไม่ดู ?view=) → ถ้าแถวเดิมไม่มี tasks
--    เปิดเมนูข้อ 1 จากแอปจัดการงานแล้วหัวบนจะเด้งไปแอปช่องทางขาย · ซ่อนไว้กันเมนูซ้ำ 2 อันในแอปจัดการงาน
--    (แบบเดียวกับ Contents = /master/assets?source=contents ที่แถว /master/assets มี tasks อยู่แล้ว)
update public.erp_menu_items
set app_keys = array_append(app_keys, 'tasks'),
    app_overrides = coalesce(app_overrides, '{}'::jsonb)
      || jsonb_build_object('tasks', coalesce(app_overrides -> 'tasks', '{}'::jsonb) || '{"place":"hidden"}'::jsonb)
where href = '/master/platform-catalog' and not ('tasks' = any(app_keys));
