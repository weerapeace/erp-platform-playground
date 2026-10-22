-- 🎀 แบบห่อของขวัญ (ทั้งออเดอร์) — ร้านตั้งแบบห่อหลายแบบได้ (ตั้งค่าการ์ด › แบบห่อ) → เก็บชื่อแบบที่ลูกค้าเลือก ณ ตอนสั่ง
-- null = ไม่ห่อ / ร้านยังไม่ตั้งแบบห่อ (ออเดอร์เดิมทั้งหมด) · แบบห่อรายชิ้นเก็บใน store_order_items.gift.styleName
alter table public.store_orders add column if not exists gift_wrap_style text;

comment on column public.store_orders.gift_wrap_style is '🎀 ชื่อแบบห่อที่เลือก (ทั้งออเดอร์) ณ ตอนสั่ง — lib/website-gift-cards wrapFeeFor';
