-- ช่อง owner_person ถูกซ่อนจากฟอร์มแล้ว (202609041000) แต่คอลัมน์ยัง NOT NULL
-- → ผู้ใช้ล้างค่าในฟอร์มเก่า (แคช) ส่ง null มา บันทึกไม่ผ่าน "ยังไม่ได้กรอกช่องที่จำเป็น: owner_person"
-- ดู [[required_fields_match_db]]: คอลัมน์ที่ไม่บังคับในทะเบียนฟิลด์ ต้องไม่ NOT NULL ใน DB
alter table public.loan_contracts alter column owner_person drop not null;
alter table public.od_facilities  alter column owner_person drop not null;
