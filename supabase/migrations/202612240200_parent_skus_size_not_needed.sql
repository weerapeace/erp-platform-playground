-- ปุ่ม "สินค้านี้ไม่ต้องใส่ไซส์" (เจ้าของเลือก 2026-11-22)
-- ติ๊กแล้ว ตัวเช็กความพร้อมงาน + ปุ่มตรวจเร็ว ไม่นับ "ยังไม่ได้ใส่ขนาด" (น้ำหนักยังต้องใส่)
alter table public.parent_skus_v2
  add column if not exists size_not_needed boolean not null default false;

comment on column public.parent_skus_v2.size_not_needed is 'สินค้านี้ไม่ต้องใส่ขนาด กว้าง×สูง×หนา — ตัวเช็กความพร้อม/ตรวจเร็วข้ามข้อขนาด';

-- ทะเบียน field กลาง: โชว์เป็นช่องติ๊กในแท็บ "รายละเอียด Platform" ต่อจากช่อง หนา (ซม.)
insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key,
  is_visible, is_required, is_editable, is_filterable, is_sortable, display_order, show_in_form, is_inline_editable, is_bulk_editable, help_text)
select m.id, 'size_not_needed', 'size_not_needed', 'ไม่ต้องใส่ไซส์', 'Size not needed', 'boolean', 'boolean', 'physical', 'content',
  false, false, true, true, false, 165, true, true, true, 'ติ๊กเมื่อสินค้านี้ไม่มีขนาดให้วัด — ระบบงานจะไม่เตือน "ยังไม่ได้ใส่ขนาด" (น้ำหนักยังต้องใส่)'
from public.erp_modules m
where m.module_key = 'parent-skus-v2'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = 'size_not_needed');
