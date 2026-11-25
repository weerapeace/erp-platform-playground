-- สินค้าสลักชื่อ (เจ้าของเลือก widget รอบ 2 แบบ B · 2026-11-25)
-- ตั้งที่ Parent SKU › กลุ่ม "รายละเอียด Platform" · หน้าเขียนการ์ดของขวัญใช้แยกแท็บสลักชื่อ + เตือนลูกค้าไม่บอกชื่อ
--   null / none = ไม่ใช่สินค้าสลักชื่อ
--   optional    = สลักได้ ไม่บังคับ (เข้าแท็บเมื่อมีรหัสท้าย SKU หรือหมายเหตุ · ไม่เตือน)
--   required    = ต้องสลักทุกชิ้น (ทุกออเดอร์เข้าแท็บ · เตือนเมื่อไม่มีชื่อ)
alter table public.parent_skus_v2 add column if not exists engrave_mode text;
alter table public.parent_skus_v2 drop constraint if exists parent_skus_v2_engrave_mode_check;
alter table public.parent_skus_v2 add constraint parent_skus_v2_engrave_mode_check
  check (engrave_mode is null or engrave_mode in ('none', 'optional', 'required'));

insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key,
  is_visible, is_required, is_editable, is_filterable, is_sortable, is_searchable, show_in_form, is_bulk_editable, display_order, options, help_text)
select m.id, 'engrave_mode', 'engrave_mode', 'สินค้าสลักชื่อ', 'Name engraving', 'select', 'text', 'physical', 'content',
  false, false, true, true, true, false, true, true, 255,
  '{"options":["none","optional","required"],"labels":{"none":"ไม่ใช่สินค้าสลักชื่อ","optional":"สลักได้ ไม่บังคับ","required":"ต้องสลักทุกชิ้น"}}'::jsonb,
  'สลักได้ ไม่บังคับ = เข้าแท็บสลักชื่อเมื่อลูกค้าเลือกรหัสท้าย SKU หรือเขียนหมายเหตุ · ต้องสลักทุกชิ้น = ทุกออเดอร์เข้าแท็บสลักชื่อ และเตือนเมื่อลูกค้าไม่บอกชื่อ'
from public.erp_modules m
where m.module_key = 'parent-skus-v2'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = 'engrave_mode');
