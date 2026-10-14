-- 🎟️ คูปองส่วนลดของเว็บร้าน (กฎกลาง lib/website-coupons.ts)
-- store_coupons             = นิยามคูปองต่อร้าน (โค้ดไม่ซ้ำในร้าน)
-- store_coupon_redemptions  = คูปองถูกใช้กับออเดอร์ไหน เบอร์อะไร ลดเท่าไร (นับจำนวนครั้ง/เบอร์ละครั้ง · ไม่นับออเดอร์ที่ยกเลิก)
-- ส่วนลดคิดฝั่งเซิร์ฟเวอร์ตอนรับออเดอร์เท่านั้น — ยอด store_orders.discount มาจากที่นี่ (ไม่แก้โครงตาราง store_orders)
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (service role) → เปิด RLS ไม่ตั้ง policy · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.store_coupons (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(12, 2) not null check (value > 0),
  min_subtotal numeric(12, 2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(12, 2) check (max_discount is null or max_discount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_phone_once boolean not null default true,
  new_customers_only boolean not null default false,
  active boolean not null default true,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code)
);

create table if not exists public.store_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.store_coupons(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  customer_phone text not null,
  discount numeric(12, 2) not null check (discount >= 0),
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists store_coupon_redemptions_coupon_idx on public.store_coupon_redemptions (coupon_id, customer_phone);

alter table public.store_coupons enable row level security;
alter table public.store_coupon_redemptions enable row level security;

comment on table public.store_coupons is 'คูปองส่วนลดของเว็บร้าน (จัดการที่ ERP /website/<shop> แท็บคูปอง · ตรวจ/คิดด้วย lib/website-coupons.ts)';
comment on table public.store_coupon_redemptions is 'คูปองที่ถูกใช้กับออเดอร์ (1 ออเดอร์ 1 คูปอง)';
