-- 🎂 คูปองวันเกิดสมาชิก (2026-10-28 · เจ้าของอนุมัติแก้ฐานข้อมูล)
-- 1) วันเกิดสมาชิก: เก็บแค่ "วัน + เดือน" ไม่เก็บปี (ข้อมูลส่วนตัวน้อยที่สุด · PDPA) — ลูกค้ากรอกเองในโปรไฟล์ ไม่บังคับ
alter table public.store_customers add column if not exists birth_month smallint check (birth_month between 1 and 12);
alter table public.store_customers add column if not exists birth_day smallint check (birth_day between 1 and 31);

-- 2) คูปองเฉพาะคน: owner_id = สมาชิกเจ้าของคูปอง (คนอื่นมองไม่เห็น/ใช้ไม่ได้ — ตรวจที่ lib/website-coupons-db checkCoupon)
--    birthday_year = ปีที่ออกคูปองวันเกิด (ดัชนีกันออกซ้ำ: 1 คน 1 ใบต่อปี) · มูลค่าจริงอ่านจากที่ตั้งร้านตอนตรวจ (lib/website-birthday)
alter table public.store_coupons add column if not exists owner_id uuid references public.store_customers(id) on delete cascade;
alter table public.store_coupons add column if not exists birthday_year smallint;
create unique index if not exists store_coupons_birthday_uidx on public.store_coupons (shop_id, owner_id, birthday_year) where birthday_year is not null;
create index if not exists store_coupons_owner_idx on public.store_coupons (owner_id) where owner_id is not null;
