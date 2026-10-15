-- 🐛 แก้: migration 202610150300 (คูปอง) ไม่ได้สร้างคอลัมน์จริง
-- สาเหตุ: มีตาราง store_coupons เก่าของเว็บ Pixiedustie เดิมอยู่แล้ว (migration 2026-07-01 · คอลัมน์ discount_type/discount_value/
--         is_active/expires_at/used_count · ว่าง 0 แถว) → "create table if not exists" ข้ามไปทั้งก้อน
--         ผล: ERP แท็บ 🎟️ คูปอง บันทึกคูปองไม่ได้ (คอลัมน์ kind/value/... ไม่มี)
-- แก้: เพิ่มคอลัมน์ตามที่โค้ดใช้ (lib/website-coupons.ts couponToRow) + กันโค้ดซ้ำในร้าน
-- คอลัมน์เก่า 5 ตัวเก็บไว้ (มีค่าเริ่มต้นทุกตัว ไม่ขวางการบันทึก · ไม่มีโค้ดไหนใช้แล้ว) — ไม่ลบเพื่อความปลอดภัย

alter table public.store_coupons add column if not exists kind text not null default 'percent' check (kind in ('percent', 'fixed'));
alter table public.store_coupons add column if not exists value numeric(12, 2) not null default 0;
alter table public.store_coupons add column if not exists max_discount numeric(12, 2) check (max_discount is null or max_discount > 0);
alter table public.store_coupons add column if not exists starts_at timestamptz;
alter table public.store_coupons add column if not exists ends_at timestamptz;
alter table public.store_coupons add column if not exists usage_limit integer check (usage_limit is null or usage_limit > 0);
alter table public.store_coupons add column if not exists per_phone_once boolean not null default true;
alter table public.store_coupons add column if not exists new_customers_only boolean not null default false;
alter table public.store_coupons add column if not exists active boolean not null default true;
alter table public.store_coupons add column if not exists note text;
alter table public.store_coupons add column if not exists created_by uuid;
alter table public.store_coupons add column if not exists created_by_name text;
alter table public.store_coupons add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.store_coupons'::regclass and conname = 'store_coupons_shop_code_key') then
    alter table public.store_coupons add constraint store_coupons_shop_code_key unique (shop_id, code);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.store_coupons'::regclass and conname = 'store_coupons_code_format') then
    alter table public.store_coupons add constraint store_coupons_code_format check (code ~ '^[A-Z0-9_-]{3,30}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.store_coupons'::regclass and conname = 'store_coupons_value_positive') then
    alter table public.store_coupons add constraint store_coupons_value_positive check (value > 0) not valid;
  end if;
end $$;

alter table public.store_coupons enable row level security;
comment on column public.store_coupons.discount_type is 'เลิกใช้ (ของเว็บเดิม) — ใช้ kind';
comment on column public.store_coupons.discount_value is 'เลิกใช้ (ของเว็บเดิม) — ใช้ value';
comment on column public.store_coupons.is_active is 'เลิกใช้ (ของเว็บเดิม) — ใช้ active';
comment on column public.store_coupons.expires_at is 'เลิกใช้ (ของเว็บเดิม) — ใช้ ends_at';
comment on column public.store_coupons.used_count is 'เลิกใช้ (ของเว็บเดิม) — นับจาก store_coupon_redemptions';
