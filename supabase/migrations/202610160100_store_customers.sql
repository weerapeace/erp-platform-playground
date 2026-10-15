-- 👤 สมาชิกเว็บร้าน (ลูกค้า) — แยกจากระบบ login พนักงานโดยสิ้นเชิง
--
-- ⚠️ ทำไมไม่ใช้ Supabase Auth ตัวเดียวกับพนักงาน: ตาราง ERP ~186 ตารางมี RLS ที่เปิดให้ "ใครก็ได้ที่ล็อกอิน"
--    ถ้าลูกค้าล็อกอินระบบเดียวกัน = ลูกค้าอ่าน/แก้ตาราง ERP ได้ → สมาชิกจึงล็อกอินที่เว็บร้าน (Google/LINE/Facebook/อีเมล)
--    แล้วเว็บร้านเรียก ERP ฝั่งเซิร์ฟเวอร์ด้วยกุญแจภายใน (STOREFRONT_INTERNAL_KEY) เท่านั้น
--
-- store_customers            = สมาชิกต่อร้าน (แยกบัญชีต่อแบรนด์ · อีเมลไม่ซ้ำในร้าน)
-- store_customer_identities  = วิธีเข้าสู่ระบบที่ผูกกับสมาชิก (google/line/facebook/password) — 1 คนผูกได้หลายวิธี
-- store_customer_addresses   = ที่อยู่จัดส่งที่บันทึกไว้
-- store_orders.customer_id   = ออเดอร์ของสมาชิก (คอลัมน์ใหม่ว่างได้ · ออเดอร์แบบไม่สมัคร = null · ไม่แตะข้อมูลเดิม)
--
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (service role) → เปิด RLS ไม่ตั้ง policy

create table if not exists public.store_customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text check (email is null or email = lower(email)),
  email_verified boolean not null default false,
  name text not null default '',
  phone text,
  avatar_url text,
  password_hash text,
  marketing_opt_in boolean not null default false,
  status text not null default 'active' check (status in ('active', 'blocked', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists store_customers_shop_email_uq on public.store_customers (shop_id, email) where email is not null and status <> 'deleted';
create index if not exists store_customers_shop_idx on public.store_customers (shop_id, created_at desc);

create table if not exists public.store_customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.store_customers(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  provider text not null check (provider in ('google', 'line', 'facebook', 'password')),
  provider_user_id text not null,
  email text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  unique (shop_id, provider, provider_user_id)
);
create index if not exists store_customer_identities_customer_idx on public.store_customer_identities (customer_id);

create table if not exists public.store_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.store_customers(id) on delete cascade,
  label text not null default '',
  name text not null,
  phone text not null,
  address_line text not null,
  subdistrict text,
  district text,
  province text,
  postal text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_customer_addresses_customer_idx on public.store_customer_addresses (customer_id);

alter table public.store_orders add column if not exists customer_id uuid references public.store_customers(id) on delete set null;
create index if not exists store_orders_customer_idx on public.store_orders (customer_id) where customer_id is not null;

alter table public.store_customers enable row level security;
alter table public.store_customer_identities enable row level security;
alter table public.store_customer_addresses enable row level security;

comment on table public.store_customers is 'สมาชิกเว็บร้าน (แยกจาก auth พนักงาน) — จัดการผ่าน /api/storefront-member (กุญแจภายใน) และ ERP แท็บสมาชิก';
comment on column public.store_orders.customer_id is 'สมาชิกเจ้าของออเดอร์ (null = สั่งแบบไม่สมัคร)';
