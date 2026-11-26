-- 🧵 ไฟล์ปัก — เก็บไฟล์ที่ร้านตีบล็อกให้ (.DST / .PES) ไว้กับงาน (ข้อเสนอ 4 รอบ 3)
-- ไฟล์เล็ก (ปกติ 10-200 KB) เก็บเป็น base64 ในแถวเลย ไม่ต้องผ่านที่เก็บไฟล์ · จำกัด 1.5 MB ที่ API
-- เพิ่มคอลัมน์ว่างล้วน (ไม่กระทบแถวเดิม)
alter table public.embroidery_designs
  add column if not exists shop_file_name text,
  add column if not exists shop_file_kind text check (shop_file_kind in ('dst', 'pes')),
  add column if not exists shop_file_b64 text,
  add column if not exists shop_file_at timestamptz;

comment on column public.embroidery_designs.shop_file_b64 is 'ไฟล์เครื่องปักที่ร้านทำให้ (base64) — ดาวน์โหลด/ดูภาพได้ในหน้างาน';
