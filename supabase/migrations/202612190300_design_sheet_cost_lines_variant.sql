-- สี/แบบ ของบรรทัดตีราคา (เช่น ดำ, น้ำตาล) — แยกกลุ่มย่อยในวัสดุเดียวกัน · เปลี่ยนวัสดุเฉพาะสีเดียวได้ (เจ้าของขอ 2026-11-18)
-- ช่องใหม่ว่าง ไม่แตะข้อมูลเดิม
alter table public.design_sheet_cost_lines add column if not exists variant text;
comment on column public.design_sheet_cost_lines.variant is 'สี/แบบ ของบรรทัด (เช่น ดำ, น้ำตาล) — แยกกลุ่มย่อยในวัสดุเดียวกัน · เจ้าของขอ 2026-11-18';
