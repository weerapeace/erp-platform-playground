-- ชุดช่องของ "ส่งออกรายละเอียดสินค้า" (หน้า /master/parent-skus/export) — เจ้าของเลือกข้อเสนอ 1 เมื่อ 2026-11-16
-- 1 แถว = 1 ชุด ใช้ร่วมกันทั้งทีม เช่น "ส่งตัวแทนต่างประเทศ" (EN) · "ส่งร้านค้า" (TH)
--   config = { fields[], lang, mode, merge, images, twoTier, hideInactiveKids } (ทำความสะอาดด้วย lib/spec-export cleanPresetConfig)
-- โค้ด: lib/spec-export.ts · API /api/parent-skus/spec-export/presets
create table if not exists public.spec_export_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spec_export_presets_active_idx on public.spec_export_presets (sort_order, created_at) where is_active;
alter table public.spec_export_presets enable row level security;   -- deny-all: อ่าน/เขียนผ่าน API (service role) เท่านั้น
revoke all on table public.spec_export_presets from anon;
comment on table public.spec_export_presets is 'ชุดช่องส่งออกรายละเอียดสินค้า (Excel) ใช้ร่วมกันทั้งทีม — API /api/parent-skus/spec-export/presets';
