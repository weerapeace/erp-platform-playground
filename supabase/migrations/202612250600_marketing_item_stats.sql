-- ยอดสะสมต่อสินค้าบนร้าน รายวัน (หน้าภาพรวมการตลาด แท็บ "คนเข้าร้าน" · เจ้าของเลือก 2026-11-25 รอบ 4 ข้อ 1)
-- Shopee ให้แค่ "ยอดสะสม" (คนดู/กดถูกใจ/ขาย/ดาว/รีวิว) → เก็บทุกคืน แล้วลบกันได้ยอดรายวัน
-- date = วันไทยที่ยอดนี้ "ณ สิ้นวัน" · เติมโดย /api/cron/marketing-traffic (00:05 เวลาไทย) · ย้อนหลังไม่ได้
create table if not exists public.marketing_item_stats (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  brand_id uuid references public.brands(id) on delete set null,
  item_id text not null,
  date date not null,
  views bigint not null default 0,
  likes bigint not null default 0,
  sales bigint not null default 0,
  rating numeric,
  comments bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (platform, item_id, date)
);
create index if not exists marketing_item_stats_date_idx on public.marketing_item_stats (date);
create index if not exists marketing_item_stats_brand_idx on public.marketing_item_stats (brand_id, date);
alter table public.marketing_item_stats enable row level security;
revoke all on public.marketing_item_stats from anon, authenticated;
