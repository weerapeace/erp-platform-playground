-- รายละเอียดงาน v2 (เจ้าของขอ 2026-11-06)
-- part_code = ส่วนประกอบจากรายการกลาง material_slots.slot_code (part_name เก็บชื่อไว้โชว์แม้รายการถูกแก้/ลบ)
-- label_dx / label_dy = ป้ายชื่อข้างหมุด ห่างจากหมุดกี่ % ของรูป (ลากหลบได้ · null = ตำแหน่งตั้งต้น)
alter table public.design_sheet_spec_pins
  add column if not exists part_code text,
  add column if not exists label_dx numeric,
  add column if not exists label_dy numeric;
