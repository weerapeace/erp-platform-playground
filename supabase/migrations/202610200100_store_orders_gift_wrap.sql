-- 🎀 ห่อของขวัญ (เว็บร้าน) — ลูกค้าเลือกตอนสั่งซื้อ · ร้านเปิด/ตั้งราคาใน ERP แท็บ 🏪 ข้อมูลร้าน (store_settings gift_*)
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม: ออเดอร์เก่าทั้งหมด = ไม่ห่อ / ค่าห่อ 0
--   gift_wrap        ลูกค้าขอห่อของขวัญ
--   gift_fee         ค่าห่อที่คิดจริงตอนสั่ง (บาท · คิดฝั่งเซิร์ฟเวอร์จากค่าที่ร้านตั้ง · รวมอยู่ใน grand_total แล้ว)
--   gift_message     ข้อความบนการ์ด (≤ 300 ตัว)
--   gift_hide_price  ไม่ใส่ใบเสร็จ/ราคาในกล่อง (ส่งให้ผู้รับเป็นของขวัญ)
alter table public.store_orders add column if not exists gift_wrap boolean not null default false;
alter table public.store_orders add column if not exists gift_fee numeric not null default 0;
alter table public.store_orders add column if not exists gift_message text;
alter table public.store_orders add column if not exists gift_hide_price boolean not null default false;
