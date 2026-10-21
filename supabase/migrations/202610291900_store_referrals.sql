-- 🎁 ชวนเพื่อน (ชุด 6 · 2026-10-22) — โค้ดชวนเพื่อน = แถวใน store_coupons ที่มี referrer_id (สมาชิกเจ้าของโค้ด)
-- ใช้ระบบคูปองเดิมทั้งหมด (ตรวจ/1 เบอร์ครั้งเดียว/ลูกค้าใหม่/บันทึกการใช้) · มูลค่าจริงอ่านจากที่ตั้งร้านตอนตรวจ (lib/website-referral)
-- referral_points = แต้มที่ให้คนชวนแล้ว (null = ยังไม่ให้) — ใช้กันให้ซ้ำ (lib/website-referral-db rewardReferral)
alter table public.store_coupons add column if not exists referrer_id uuid references public.store_customers(id) on delete cascade;
create unique index if not exists store_coupons_referrer_uidx on public.store_coupons (shop_id, referrer_id) where referrer_id is not null;
alter table public.store_coupon_redemptions add column if not exists referral_points integer;

comment on column public.store_coupons.referrer_id is 'โค้ดชวนเพื่อนของสมาชิกคนนี้ (null = คูปองปกติ) — แท็บคูปอง ERP ไม่โชว์';
comment on column public.store_coupon_redemptions.referral_points is 'แต้มที่ให้คนชวนจากออเดอร์นี้แล้ว (null = ยังไม่ให้)';
