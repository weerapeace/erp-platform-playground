-- ============================================================
-- 📤 ลงสินค้าบนแพลตฟอร์ม — เมนูในแอป "ช่องทางขาย" (เพิ่มเมนูอย่างเดียว ไม่แก้โครงตาราง)
-- หน้า /master/platform-listing: เอาสินค้าจาก ERP ขึ้นร้าน (เตรียมร่าง + ตรวจความครบ)
-- คนละทิศกับ 🛒 สินค้าบนแพลตฟอร์ม (/master/platform-catalog = ดูของที่อยู่บนร้าน)
-- ============================================================
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys)
select 'งานขายออนไลน์', 20, 8, '📤', 'ลงสินค้าบนแพลตฟอร์ม', '/master/platform-listing', true, true, 'products.platforms.view', true, array['marketplace']
where not exists (select 1 from public.erp_menu_items where href = '/master/platform-listing');
