-- เฟส 1b: หมวดหมู่ปลายทาง (mapping) + เลือกรูปต่อแพลตฟอร์ม
-- 1) map หมวดหมู่กลาง→แพลตฟอร์ม (ใช้ซ้ำทุกสินค้าในหมวดเดียวกัน)
create table if not exists public.platform_category_mappings (
  id uuid primary key default gen_random_uuid(),
  central_category_id uuid not null,
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  platform_category_path text,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (central_category_id, platform_id)
);
alter table public.platform_category_mappings enable row level security;
drop policy if exists platform_category_mappings_sel on public.platform_category_mappings;
create policy platform_category_mappings_sel on public.platform_category_mappings for select to authenticated using (true);

-- 2) รูปที่เลือกส่งไปแต่ละแพลตฟอร์ม (เก็บ r2_key เป็น array บนร่าง)
alter table public.platform_listing_drafts add column if not exists image_keys jsonb not null default '[]'::jsonb;
