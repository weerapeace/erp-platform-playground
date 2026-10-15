-- 🎴 การ์ดของขวัญ (เว็บร้าน) — ลูกค้าเขียนการ์ดตอนสั่ง: ถึง/จาก/ลายการ์ด/ตัวหนังสือ/โอกาส + ร้านพิมพ์แล้วหรือยัง
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม (ออเดอร์เก่า = null = ไม่มีการ์ด) · ข้อความบนการ์ดยังอยู่ที่ gift_message เดิม
-- รูปร่าง (lib/website-gift-cards.ts normalizeOrderCard):
--   { design, font, occasion, to, from, anon, printedAt, printedBy }
-- ลายการ์ด/ขนาด/ไอเดียข้อความของร้าน เก็บที่ store_settings key "gift_cards" (JSON) — ไม่ต้องมีตารางใหม่
alter table public.store_orders add column if not exists gift_card jsonb;
