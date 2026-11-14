-- 🎨 Swatch รอบ 8 (เจ้าของอนุมัติ 2026-11-14): กรอบชิ้น "ดัดมุมได้" — ชิ้นที่ถ่ายเอียงไม่เป็นสี่เหลี่ยมตรง
-- points = จุดมุมของกรอบ [[x,y], …] เป็น % ของรูป (0-100) เรียงรอบรูป · null = สี่เหลี่ยมตรง (ใช้ x/y/w/h เดิม)
-- x/y/w/h ยังเก็บเสมอ = กรอบสี่เหลี่ยมที่ครอบจุดทั้งหมด → หน้าอื่นที่อ่านกรอบสี่เหลี่ยม (Design Library · ช่องสีใบงาน · ลิงก์หน้า SKU) ใช้ต่อได้
alter table public.sku_swatch_spots add column if not exists points jsonb;
alter table public.sku_swatch_spots drop constraint if exists sku_swatch_spots_points_chk;
alter table public.sku_swatch_spots add constraint sku_swatch_spots_points_chk
  check (points is null or (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 3 and 8));
