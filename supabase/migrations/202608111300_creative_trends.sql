-- 🔥 เทรนด์ (Creative Trends) — 1 เทรนด์ = 1 กระดานวาด (กรอบหน้า 16:9) + เช็คลิสต์ "ต้องมีอะไรบ้าง"
-- กระดานเก็บที่ erp_canvas_sketches (entity_type='creative_trend', entity_id=trend.id) ตามของกลางเดิม
create table if not exists public.erp_creative_trends (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  summary      text,
  heat         text not null default 'rising',          -- hot / rising / cooling
  brand_id     uuid references public.brands(id) on delete set null,
  platforms    text[] not null default '{}',            -- ช่องทางที่จะใช้ (fb/ig/tiktok/shopee/lazada/web)
  source_url   text,                                    -- ลิงก์ต้นทางของเทรนด์
  tags         text[] not null default '{}',
  start_date   date,
  end_date     date,                                    -- เทรนด์ใช้ได้ถึงเมื่อไหร่
  checklist    jsonb not null default '{}'::jsonb,      -- { key: { done: bool, note: text } }
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_erp_creative_trends_active on public.erp_creative_trends(is_active, sort_order);
comment on table public.erp_creative_trends is 'เทรนด์ Creative — กระดานเทรนด์ 1 หน้า + เช็คลิสต์สิ่งที่ต้องมี (โทนสี/ref/เลย์เอาต์ ฯลฯ)';

alter table public.erp_creative_trends enable row level security;
drop policy if exists authenticated_all on public.erp_creative_trends;
create policy authenticated_all on public.erp_creative_trends for all to authenticated using (true) with check (true);
