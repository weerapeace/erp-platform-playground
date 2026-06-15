-- Design Sheets — Group cost (เฟส 1): ตีราคาแบบ "กลุ่มวัสดุ" + ฐานราคา เฉลี่ย/ตั้งไว้
-- (applied via MCP apply_migration: design_group_cost_phase1) — additive ทั้งหมด

-- ราคาตั้ง (set) ต่อกลุ่มวัสดุ
ALTER TABLE public.material_groups
  ADD COLUMN IF NOT EXISTS set_price numeric;

-- จำกลุ่ม + ฐานราคาที่ใช้ในบรรทัดตีราคา (โหมดกลุ่ม: item_id=null, group_code=กลุ่ม, price_basis=avg/set)
ALTER TABLE public.design_sheet_cost_lines
  ADD COLUMN IF NOT EXISTS group_code  text,
  ADD COLUMN IF NOT EXISTS price_basis text;

-- ลงทะเบียนช่อง set_price ในหน้าจัดการกลุ่มวัสดุ (Field Registry) ให้โผล่ในฟอร์ม
INSERT INTO public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, source, group_key,
   is_visible, is_required, is_editable, is_filterable, is_sortable, is_searchable,
   width, min_width, display_order, show_in_form, form_column_span, is_active, help_text)
SELECT m.id, 'set_price', 'set_price', 'ราคาตั้ง (บาท/หน่วย)', 'number', 'text', 'physical', 'core',
   true, false, true, false, true, false, 140, 72, 45, true, 1, true,
   'ราคาตั้งของกลุ่ม (ใช้เป็นฐานราคาแบบ "ตั้งไว้" ตอนตีราคาแบบกลุ่ม)'
FROM public.erp_modules m WHERE m.module_key='material-groups'
  AND NOT EXISTS (SELECT 1 FROM public.erp_module_fields f WHERE f.module_id=m.id AND f.column_name='set_price');
