-- รายชื่อสมัครรับข่าวสารจากเว็บร้าน (บล็อก "สมัครรับข่าวสาร" ในตัวจัดหน้าเว็บ)
-- ร้านละชุด · อีเมลซ้ำในร้านเดียวกันไม่เพิ่ม · RLS เปิด (anon แตะไม่ได้ — เขียนผ่าน service role ใน API เท่านั้น)
create table if not exists public.store_subscribers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null,
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create unique index if not exists store_subscribers_shop_email_key on public.store_subscribers (shop_id, email);
create index if not exists idx_store_subscribers_shop on public.store_subscribers (shop_id, created_at desc);
alter table public.store_subscribers enable row level security;
