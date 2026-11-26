-- หน้าภาพรวมการตลาด รอบ 7 (เจ้าของเลือก 2026-11-26 · แท็บ "รีวิว" + "คอนเทนต์")
--   marketing_reviews      = รีวิวสินค้า Shopee (get_comment · ล่าสุด ≤ 500/ร้าน) — ดาว/ข้อความ/รูป/ร้านตอบแล้วหรือยัง
--   marketing_social_posts = โพสต์ Facebook / Instagram (+ วิดีโอ Shopee ถ้าแอปมีสิทธิ์) — ถูกใจ/คอมเมนต์/แชร์
--   marketing_competitors  = คู่แข่ง (กรอกเอง · แก้/ลบแบบเก็บไว้ (is_active)/ย้อนกลับได้ · history = ราคา/ยอดขายทุกครั้งที่แก้)
-- เติม 2 ตารางแรกโดย /api/cron/marketing-content (อ่านจากแพลตฟอร์มอย่างเดียว) · ทุกตาราง server เท่านั้น
create table if not exists public.marketing_reviews (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  brand_id uuid references public.brands(id) on delete set null,
  comment_id text not null,
  item_id text,
  order_sn text,
  rating int,
  comment text,
  buyer text,
  images jsonb,
  hidden boolean not null default false,
  created_at_shop timestamptz,
  reply text,
  replied_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (platform, comment_id)
);
create index if not exists marketing_reviews_time_idx on public.marketing_reviews (created_at_shop);
alter table public.marketing_reviews enable row level security;
revoke all on public.marketing_reviews from anon, authenticated;

create table if not exists public.marketing_social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  brand_id uuid references public.brands(id) on delete set null,
  post_id text not null,
  message text,
  permalink text,
  media_type text,
  image_url text,
  posted_at timestamptz,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  views bigint,
  updated_at timestamptz not null default now(),
  unique (platform, post_id)
);
create index if not exists marketing_social_posts_time_idx on public.marketing_social_posts (posted_at);
alter table public.marketing_social_posts enable row level security;
revoke all on public.marketing_social_posts from anon, authenticated;

create table if not exists public.marketing_competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  platform text,
  shop_name text,
  product_name text not null,
  url text,
  price numeric,
  rating numeric,
  sold bigint,
  our_parent_sku_id uuid references public.parent_skus_v2(id) on delete set null,
  note text,
  history jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_competitors enable row level security;
revoke all on public.marketing_competitors from anon, authenticated;
