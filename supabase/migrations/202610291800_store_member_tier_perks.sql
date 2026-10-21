-- ⭐ สิทธิ์ตามระดับสมาชิก (ชุด 6 · 2026-10-22) — ลด % ทุกออเดอร์ + ส่งฟรี ต่อระดับ
-- ค่าเริ่ม = ไม่มีสิทธิ์ (0% · ไม่ส่งฟรี) → ระดับเดิมทำงานเหมือนเดิมทุกอย่าง
-- คิดราคาจริงที่ lib/website-orders createStorefrontOrder (สมาชิก + ร้านเปิดแต้ม) · เว็บร้านโชว์ยอดตามสูตรเดียวกัน
alter table public.store_member_tiers add column if not exists discount_pct numeric not null default 0 check (discount_pct >= 0 and discount_pct <= 50);
alter table public.store_member_tiers add column if not exists free_shipping boolean not null default false;

comment on column public.store_member_tiers.discount_pct is 'ลด % ทุกออเดอร์ของสมาชิกระดับนี้ (คิดจากยอดหลังโปรโมชัน ก่อนคูปอง) 0–50';
comment on column public.store_member_tiers.free_shipping is 'สมาชิกระดับนี้ส่งฟรี (ค่าธรรมเนียมเก็บปลายทางยังคิด)';
