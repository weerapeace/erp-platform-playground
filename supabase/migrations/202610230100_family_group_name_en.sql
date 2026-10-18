-- ชื่ออังกฤษของกลุ่มแท็ก / หมวดย่อย (คู่กับ product_families.name_en)
-- ตั้งค่าในป๊อป 🗂️ จัดการแท็ก (components/tag-organizer) · ว่าง = ยังไม่มีชื่ออังกฤษ
alter table public.product_family_groups add column if not exists name_en text;

comment on column public.product_family_groups.name_en is 'ชื่ออังกฤษของกลุ่ม/หมวดย่อยแท็ก (ว่าง = ใช้ชื่อไทย)';
