-- ใบงานออกแบบ: ชื่อแท็บตีราคา "ทั่วไป" ตั้งเองได้ต่อใบ (เจ้าของขอ 2026-10-22)
-- null / ว่าง = แสดง "ทั่วไป" เหมือนเดิม · ไม่แตะข้อมูลเดิม (คีย์แท็บยังเป็น "" / parent_code null)
alter table public.design_sheets add column if not exists cost_general_label text;
comment on column public.design_sheets.cost_general_label is 'ชื่อแท็บตีราคา "ทั่วไป" ที่ตั้งเอง (null = ทั่วไป)';
