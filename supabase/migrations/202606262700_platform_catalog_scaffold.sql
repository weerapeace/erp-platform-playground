-- โครงโมดูล "สินค้าบนแพลตฟอร์ม" (ทิศอ่าน) — field schema + catalog · ยังไม่ดึงข้อมูลจริง
-- 1) ฟิลด์ของแต่ละแพลตฟอร์ม (field discovery → ใช้ทำ field mapping)
create table if not exists public.platform_field_schemas (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  field_key text not null,
  field_label text,
  data_type text default 'text',
  is_required boolean not null default false,
  sample text,
  sort_order int not null default 0,
  source text not null default 'manual',   -- manual | import | api
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, field_key)
);
alter table public.platform_field_schemas enable row level security;
drop policy if exists platform_field_schemas_sel on public.platform_field_schemas;
create policy platform_field_schemas_sel on public.platform_field_schemas for select to authenticated using (true);

-- 2) สินค้าที่อยู่บนร้าน/แพลตฟอร์ม (catalog) — เก็บข้อมูลดิบ + จับคู่กับสินค้าเรา
create table if not exists public.platform_catalog_listings (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  account_id uuid,
  brand_id uuid,
  external_product_id text,
  title text,
  sku_code text,
  matched_parent_sku_id uuid,
  price numeric,
  status text,
  raw jsonb not null default '{}'::jsonb,
  source text not null default 'import',    -- import | api
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_platform_catalog_platform on public.platform_catalog_listings(platform_id);
create index if not exists idx_platform_catalog_matched on public.platform_catalog_listings(matched_parent_sku_id);
alter table public.platform_catalog_listings enable row level security;
drop policy if exists platform_catalog_listings_sel on public.platform_catalog_listings;
create policy platform_catalog_listings_sel on public.platform_catalog_listings for select to authenticated using (true);
