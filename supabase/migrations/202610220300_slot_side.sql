-- 📝 ป๊อป "แทรกรายละเอียด" — ช่องอยู่ด้านใน/ด้านนอกกระเป๋า (รายการกลาง product_highlight_items ชนิด slot)
-- เหตุผล: เจ้าของอยากได้บรรทัดแยก "ด้านในกระเป๋า: …" / "ด้านนอก: …" ตามแบบคำอธิบายเดิม
-- null = ไม่ระบุ (รวมบรรทัดเดียวแบบเดิม) · ไม่กระทบของเดิม
alter table public.product_highlight_items
  add column if not exists slot_side text;
alter table public.product_highlight_items drop constraint if exists product_highlight_items_slot_side_check;
alter table public.product_highlight_items add constraint product_highlight_items_slot_side_check check (slot_side is null or slot_side in ('inside', 'outside'));

-- ทะเบียนฟิลด์ (หน้า /m/product_highlight_items เห็น + แก้ได้)
insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, width, display_order, show_in_form, options, help_text, placeholder)
select m.id, 'slot_side', 'slot_side', 'ตำแหน่งช่อง', 'Pocket side', 'select', 'text', 'physical', 'core', true, false, true, true, true, 130, 6, true,
  '{"options":["inside","outside"],"labels":{"inside":"ด้านใน","outside":"ด้านนอก"}}'::jsonb,
  'เฉพาะชนิด "ช่อง" · ด้านใน/ด้านนอก = แยกบรรทัด "ด้านในกระเป๋า: …" / "ด้านนอก: …" · ว่าง = รวมบรรทัดเดียว', null
from public.erp_modules m
where m.module_key = 'product_highlight_items'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = 'slot_side');
