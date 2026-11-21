-- 🖼 เปลี่ยนปกโปร: เช็กซ้ำหลังร้านตรวจรูปที่ย้อนกลับ (เจ้าของสั่ง 2026-11-21 "ทำเลย")
-- TikTok/Lazada รับคำขอย้อนแล้วต้องตรวจรูปเดิมอีกรอบ — ระบบเคยนับ "ย้อนแล้ว" ตั้งแต่ตอนส่งคำขอ
-- ตัวตั้งเวลากลับมาดูบนร้านจริง (TikTok หลัง 1 ชม. · Lazada หลัง 24 ชม.) ถ้าปกโปรยังค้าง/ร้านไม่ผ่าน → ย้อนไม่ผ่าน + แจ้งเตือน
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม
alter table public.promo_cover_targets add column if not exists revert_checked_at timestamptz null;  -- เช็กบนร้านหลังย้อนแล้วเมื่อไหร่ (null = ยังไม่เช็ก)
create index if not exists promo_cover_targets_revert_check_idx on public.promo_cover_targets (reverted_at)
  where status = 'reverted' and revert_checked_at is null and platform in ('tiktok','lazada');
