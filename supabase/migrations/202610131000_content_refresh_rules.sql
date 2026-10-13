-- วางแผนคอนเทนต์: กฎ "ต้องเปลี่ยนทุกกี่วัน" (เช่น แต่งร้าน Shopee ทุก 14 วัน)
-- ระบบเอาไปเทียบกับคอนเทนต์ที่ลงไว้ → เตือนในปฏิทินว่าแต่ละที่ "เตรียมไว้หรือยัง / ใกล้ถึงรอบ / เลยรอบ"
-- ไม่แตะข้อมูลคอนเทนต์เดิม (อ่านอย่างเดียว)

create table if not exists public.content_refresh_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  placement_type text,                    -- key ของประเภทการลง (เช่น shop_decor) · null = ทุกประเภทบนช่องทางนี้
  platform text not null,
  every_days integer not null check (every_days between 1 and 365),
  lead_days integer not null default 3 check (lead_days between 0 and 60),   -- เตือนล่วงหน้ากี่วัน
  title text check (title is null or char_length(title) <= 200),            -- ชื่อเรียก เช่น "แบนเนอร์หน้าร้าน"
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_content_refresh_rules
  on public.content_refresh_rules (brand_id, coalesce(placement_type, ''), platform);
alter table public.content_refresh_rules enable row level security;
