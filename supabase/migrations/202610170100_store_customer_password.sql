-- 👤 สมาชิก M3: สมัครด้วยอีเมล + รหัสผ่าน (ยืนยันอีเมล / ลืมรหัสผ่าน)
-- store_customer_tokens = ลิงก์ยืนยันอีเมล / ตั้งรหัสใหม่ (เก็บแค่ hash ของโทเคน · ใช้ได้ครั้งเดียว · มีวันหมดอายุ)
-- store_customers.failed_login_count / locked_until = กันเดารหัสผ่าน (ผิด 5 ครั้ง ล็อก 15 นาที)
-- รหัสผ่านเก็บเป็น scrypt hash ใน store_customers.password_hash (คอลัมน์มีแล้วจาก M1) · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.store_customer_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.store_customers(id) on delete cascade,
  kind text not null check (kind in ('verify', 'reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists store_customer_tokens_customer_idx on public.store_customer_tokens (customer_id, kind, created_at desc);

alter table public.store_customers add column if not exists failed_login_count integer not null default 0;
alter table public.store_customers add column if not exists locked_until timestamptz;

alter table public.store_customer_tokens enable row level security;
comment on table public.store_customer_tokens is 'โทเคนยืนยันอีเมล/ตั้งรหัสผ่านใหม่ของสมาชิกเว็บร้าน (เก็บเฉพาะ sha256)';
