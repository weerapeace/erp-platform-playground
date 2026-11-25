-- รายการโปรโมชั่นบนร้าน (หน้าภาพรวมการตลาด แท็บ "โปรโมชั่น" · เจ้าของเลือก 2026-11-25 รอบ 6 ข้อ 1)
-- kind: voucher = โค้ดส่วนลด (ใช้ไป/สิทธิ์ทั้งหมด) · discount = โปรลดราคา · flash_sale = แฟลชเซลของร้าน (คนกดเตือน/คลิก)
-- เติมโดย /api/cron/marketing-promos (วันละครั้ง 08:50) — อ่านจากร้านอย่างเดียว ไม่สร้าง/แก้โปร
create table if not exists public.marketing_promotions (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  brand_id uuid references public.brands(id) on delete set null,
  account_id text not null,
  kind text not null check (kind in ('voucher', 'discount', 'flash_sale')),
  promo_id text not null,
  name text,
  code text,
  status text,
  start_at timestamptz,
  end_at timestamptz,
  usage_quantity bigint,
  current_usage bigint,
  discount_amount numeric,
  percentage numeric,
  reward_type int,
  purpose int,
  item_count bigint,
  remind_count bigint,
  click_count bigint,
  raw jsonb,
  updated_at timestamptz not null default now(),
  unique (platform, kind, promo_id)
);
create index if not exists marketing_promotions_time_idx on public.marketing_promotions (start_at, end_at);
alter table public.marketing_promotions enable row level security;
revoke all on public.marketing_promotions from anon, authenticated;
