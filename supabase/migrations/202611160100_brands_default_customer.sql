-- ลูกค้าประจำแบรนด์ (งานลูกค้า เช่น Good Goods → เซ็นทรัลทำ) — ตั้งที่หน้าแบรนด์ครั้งเดียว
-- ใช้เติมลูกค้าให้อัตโนมัติตอนสร้างใบสั่งขายจากป๊อปสร้างใบสั่งผลิต / ลงออเดอร์จาก Design Dashboard
-- (applied บน prod แล้ว 2026-11-05 ชื่อ brands_default_customer)
alter table public.brands add column if not exists default_customer_id uuid references public.partners_v2(id) on delete set null;
comment on column public.brands.default_customer_id is 'ลูกค้าประจำแบรนด์ (งานลูกค้า) — เติมให้ตอนสร้างใบสั่งขาย';
