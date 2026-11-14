-- 📚 Design Library รอบ 4 (เจ้าของสั่ง 2026-11-14): ประเภทกระเป๋า + ช่องรูปลายเส้น
-- ไม่แตะข้อมูลเดิม: แค่ขยายค่าที่ยอมให้ใส่ใน 2 คอลัมน์ + ใส่ประเภทตั้งต้น 5 ตัว (แก้/ลบได้ที่ ⚙️ ตัวเลือก)
--  • design_library_choices.list_key เพิ่ม 'bag_type' — รหัส = ตัวนำหน้ารหัสแม่แบบ (HANB → HANB-001) · name_en ใช้ใน prompt
--  • design_library_renders.view_key เพิ่ม 'line' — รูปลายเส้นจาก prompt "ลายเส้น" → ตั้งเป็นรูป Vector ของแม่แบบได้
--  • แม่แบบเก็บรหัสประเภทใน design_library_templates.category (คอลัมน์เดิม) · หูกระเป๋าเก็บใน default_spec/spec (jsonb เดิม)

alter table public.design_library_choices drop constraint if exists design_library_choices_list_key_check;
alter table public.design_library_choices add constraint design_library_choices_list_key_check
  check (list_key in ('bag_type', 'category', 'hw_color', 'thread_color', 'pocket_type', 'rule'));

alter table public.design_library_renders drop constraint if exists design_library_renders_view_key_check;
alter table public.design_library_renders add constraint design_library_renders_view_key_check
  check (view_key in ('grid4', 'inside', 'model', 'line', 'other'));

insert into public.design_library_choices (list_key, code, name, name_en, sort_order) values
  ('bag_type', 'HANB', 'กระเป๋าถือ',        'Handbag',       10),
  ('bag_type', 'TOTE', 'กระเป๋าโท้ท',       'Tote bag',      20),
  ('bag_type', 'CROS', 'กระเป๋าสะพายข้าง',  'Crossbody bag', 30),
  ('bag_type', 'BKPK', 'เป้',               'Backpack',      40),
  ('bag_type', 'CLUT', 'คลัตช์',            'Clutch',        50)
on conflict (list_key, code) do nothing;
