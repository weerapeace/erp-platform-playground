-- 🎀 ห่อของขวัญ / 💌 การ์ด "รายชิ้น" (ดีไซน์ตะกร้า › ห่อ/การ์ดคิดแบบ "เลือกรายชิ้น")
-- เก็บว่ารายการไหนห่อ / มีการ์ด + ข้อความบนการ์ด + ค่าบริการของรายการนั้น
--   { "wrap": true, "card": true, "message": "...", "wrapFee": 50, "cardFee": 20 }
-- null = ไม่ได้เลือก (ออเดอร์เดิมทั้งหมด) · ยอดรวมค่าห่อ/การ์ดยังอยู่ store_orders.gift_fee / gift_card_fee เหมือนเดิม
alter table public.store_order_items add column if not exists gift jsonb;

comment on column public.store_order_items.gift is '🎀 ห่อ/💌 การ์ด รายชิ้น {wrap, card, message, wrapFee, cardFee} — lib/website-item-gift';
