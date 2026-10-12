-- วางแผนคอนเทนต์ ก้อน 2: เป้ารายเดือน + สล็อตประจำสัปดาห์ (→ สร้างแผนทั้งเดือน)

-- เป้ารายเดือน (ใช้ซ้ำทุกเดือน) ต่อแบรนด์ × ช่องทาง (× รูปแบบ ถ้าระบุ)
create table if not exists public.content_plan_targets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null,
  post_type text,                       -- null = ทุกรูปแบบ · ค่าเดียวจาก POST_TYPES (image/album/video/reel/story/live)
  monthly_count integer not null check (monthly_count between 1 and 500),
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_content_plan_targets on public.content_plan_targets (brand_id, platform, coalesce(post_type, ''));
alter table public.content_plan_targets enable row level security;

-- สล็อตประจำสัปดาห์: ทุกวัน X เวลา Y ลงช่องทาง Z แนว W → กดสร้างแผนทั้งเดือนได้
create table if not exists public.content_plan_slots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = จันทร์ … 6 = อาทิตย์
  post_time text not null default '10:00' check (post_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  platform text not null,
  post_type text,
  pillar_id uuid references public.marketing_sku_labels(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_content_plan_slots_brand on public.content_plan_slots (brand_id);
alter table public.content_plan_slots enable row level security;

-- คอนเทนต์ที่สร้างจากสล็อต → จำว่ามาจากสล็อตไหน (กันสร้างซ้ำวันเดิม)
alter table public.erp_creative_content
  add column if not exists plan_slot_id uuid references public.content_plan_slots(id) on delete set null;
create index if not exists ix_erp_creative_content_plan_slot on public.erp_creative_content (plan_slot_id) where plan_slot_id is not null;
