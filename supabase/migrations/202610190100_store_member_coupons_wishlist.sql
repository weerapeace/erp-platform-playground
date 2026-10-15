-- 🎟️❤️ สมาชิก M5: คูปองเฉพาะสมาชิก + รายการโปรด
-- store_coupons.members_only = ใช้ได้เฉพาะคนที่เข้าสู่ระบบ · min_tier = ระดับขั้นต่ำ (รหัสระดับใน store_member_tiers · ตั้ง = เฉพาะสมาชิกด้วย)
-- store_wishlists = สินค้าที่สมาชิกกดใจ (1 คน 1 รุ่น 1 แถว · ลบสมาชิก/สินค้า = ลบตาม)
-- ตรวจแล้ว: ไม่มีตารางชื่อนี้ค้างจากระบบเก่า (to_regclass = null) · คอลัมน์ใหม่ค่าเริ่ม false/null ไม่แตะคูปองเดิม
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น → เปิด RLS ไม่ตั้ง policy

alter table public.store_coupons add column if not exists members_only boolean not null default false;
alter table public.store_coupons add column if not exists min_tier text check (min_tier is null or min_tier ~ '^[a-z0-9-]{1,20}$');

create table if not exists public.store_wishlists (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.store_customers(id) on delete cascade,
  parent_sku_id uuid not null references public.parent_skus_v2(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (customer_id, parent_sku_id)
);
create index if not exists store_wishlists_shop_product_idx on public.store_wishlists (shop_id, parent_sku_id);

alter table public.store_wishlists enable row level security;
comment on table public.store_wishlists is 'รายการโปรดของสมาชิกเว็บร้าน (กดหัวใจที่สินค้า)';
