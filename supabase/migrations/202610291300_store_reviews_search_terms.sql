-- ⭐ รีวิวสินค้า + 🔍 คำค้นของลูกค้า (เว็บร้าน · ชุด 2 · 2026-10-21)
-- ตารางใหม่ทั้งคู่ ไม่แตะข้อมูลเดิม · เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (service role) → เปิด RLS ไม่ตั้ง policy

-- ─── ⭐ store_reviews: 1 แถว = 1 รีวิวของ 1 รุ่น (parent_code) ───
-- status: pending (รอตรวจ) · approved (ขึ้นเว็บ) · hidden (ร้านซ่อน)
-- order_id มี = ซื้อจริง (ยืนยันจากเลขออเดอร์+เบอร์ หรือลิงก์ในอีเมล) · 1 ออเดอร์รีวิวรุ่นเดิมได้ครั้งเดียว
-- images = r2 key (storefront-reviews/...) สูงสุด 4 รูป · points_awarded = แต้มที่ให้ไปแล้ว (กันให้ซ้ำ)
create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  parent_code text not null check (char_length(parent_code) between 1 and 80),
  product_name text,
  variant_label text,
  order_id uuid references public.store_orders(id) on delete set null,
  customer_id uuid,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  author_name text not null default '' check (char_length(author_name) <= 60),
  images text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  verified boolean not null default false,
  lang text not null default 'th',
  reply text check (reply is null or char_length(reply) <= 1000),
  replied_at timestamptz,
  points_awarded integer not null default 0,
  moderated_by uuid,
  moderated_by_name text,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists store_reviews_order_code_uniq on public.store_reviews (order_id, parent_code) where order_id is not null;
create index if not exists store_reviews_public_idx on public.store_reviews (shop_id, parent_code, status, created_at desc);
create index if not exists store_reviews_queue_idx on public.store_reviews (shop_id, status, created_at desc);

alter table public.store_reviews enable row level security;

comment on table public.store_reviews is 'รีวิวสินค้าจากลูกค้าเว็บร้าน (ส่งผ่าน /api/public/storefront/reviews · ตรวจ/ตอบที่ ERP แท็บ ⭐ รีวิว)';
comment on column public.store_reviews.verified is 'ซื้อจริง (ผูกออเดอร์ที่ส่งแล้ว/สำเร็จ)';
comment on column public.store_reviews.points_awarded is 'แต้มสมาชิกที่ให้แล้วสำหรับรีวิวนี้ (0 = ยังไม่ให้) — กันให้ซ้ำเมื่ออนุมัติใหม่';

-- ─── 🔍 store_search_terms: นับคำค้นรายวัน (ไม่เก็บว่าใครค้น) ───
create table if not exists public.store_search_terms (
  shop_id uuid not null references public.shops(id) on delete cascade,
  day date not null,
  q text not null check (char_length(q) between 1 and 60),
  hits integer not null default 1,
  last_results integer not null default 0,
  primary key (shop_id, day, q)
);

create index if not exists store_search_terms_recent_idx on public.store_search_terms (shop_id, day desc);

alter table public.store_search_terms enable row level security;

comment on table public.store_search_terms is 'คำที่ลูกค้าค้นบนเว็บร้าน นับรายวัน + ผลลัพธ์ครั้งล่าสุด (0 = หาไม่เจอ) — ใช้ทำรายการคำที่หาไม่เจอ/สถิติ';

-- บวกนับแบบอะตอม (ยิงพร้อมกันหลายคนไม่หาย) · เรียกจาก API ERP ด้วย service role เท่านั้น
create or replace function public.store_search_log(p_shop uuid, p_q text, p_results integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.store_search_terms (shop_id, day, q, hits, last_results)
  values (p_shop, (now() at time zone 'Asia/Bangkok')::date, left(lower(trim(p_q)), 60), 1, greatest(0, p_results))
  on conflict (shop_id, day, q) do update set hits = store_search_terms.hits + 1, last_results = excluded.last_results;
$$;

revoke all on function public.store_search_log(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.store_search_log(uuid, text, integer) to service_role;
