-- 📐 เช็คขนาด รอบ C: รูปของตุ๊กตา/ของในทะเบียน "ใส่อะไรได้บ้าง" → ปุ่มเลือกบนเว็บมีรูป (กดง่ายกว่าอ่านชื่อ)
-- image_key = R2 key (ช่องรูปของกลาง ui image แบบเดียวกับ product-groups.image_key) · ว่าง = ปุ่มโชว์แค่ชื่อเหมือนเดิม
-- ตรวจแล้ว: ยังไม่มีคอลัมน์ชื่อนี้ · คอลัมน์ใหม่ว่างได้ ไม่แตะข้อมูลเดิม

alter table public.product_fit_items add column if not exists image_key text;

insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, width, display_order, show_in_form, options, help_text)
select m.id, 'image_key', 'image_key', 'รูป', 'Image', 'image', 'text', 'physical', 'core', true, false, true, false, false, 80, 25, true, '{}'::jsonb,
       'รูปตุ๊กตา/ของ (พื้นหลังเรียบ ภาพจัตุรัส) — โชว์บนปุ่มเลือกใน Section เช็คขนาดบนเว็บ'
from public.erp_modules m
where m.module_key = 'product_fit_items'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = 'image_key');
