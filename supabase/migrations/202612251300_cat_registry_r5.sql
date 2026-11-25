-- 🐾 ทะเบียนแมว รอบ 5 — วันรับเลี้ยง · ร้านที่ซื้อ (ประวัติราคา เทียบร้าน)
--
-- เจ้าของเลือก 2026-11-25 ข้อเสนอ 1, 3, 4, 5, 6, 7 (ตัวช่วยเริ่มต้น · รายการต้องซื้อ · เตือนน้ำหนักลด · สมุดสุขภาพ ·
--   วันเกิด/วันรับเลี้ยง · ประวัติราคา) — ที่เหลือคำนวณจากข้อมูลเดิม ไม่ต้องมีตารางใหม่ · คู่มือ docs/cat-registry.md
-- เพิ่มคอลัมน์ว่างได้ทั้งคู่ → ข้อมูลเดิมไม่กระทบ

alter table public.cats add column if not exists adopted_date date;
alter table public.cat_purchases add column if not exists shop_name text;

comment on column public.cats.adopted_date is 'วันรับเลี้ยง — ขึ้นปฏิทินทุกปี + แจ้ง LINE วันนั้น';
comment on column public.cat_purchases.shop_name is 'ซื้อจากร้าน (ใส่ร้านประจำของรายการให้ก่อน) — ใช้เทียบราคาต่อชิ้นระหว่างร้าน';
