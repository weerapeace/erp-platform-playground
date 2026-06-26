-- เฟส 2: ร้านตามแบรนด์ + คิว publish + สถานะ/ลิงก์รีวิว (pipeline ในบ้าน + mock connector)
-- 1) Platform Account Registry — ร้านต่อ (แบรนด์ × แพลตฟอร์ม)
create table if not exists public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  label text,
  external_shop_id text,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform_id)
);
alter table public.platform_accounts enable row level security;
drop policy if exists platform_accounts_sel on public.platform_accounts;
create policy platform_accounts_sel on public.platform_accounts for select to authenticated using (true);

-- 2) คิว publish/update
create table if not exists public.platform_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  parent_sku_id uuid not null,
  platform_id uuid not null,
  account_id uuid,
  job_type text not null default 'publish',
  status text not null default 'waiting',
  result jsonb,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_platform_publish_jobs_parent on public.platform_publish_jobs(parent_sku_id);
alter table public.platform_publish_jobs enable row level security;
drop policy if exists platform_publish_jobs_sel on public.platform_publish_jobs;
create policy platform_publish_jobs_sel on public.platform_publish_jobs for select to authenticated using (true);

-- 3) ผล publish เก็บบนร่าง
alter table public.platform_listing_drafts add column if not exists platform_product_id text;
alter table public.platform_listing_drafts add column if not exists review_link text;
alter table public.platform_listing_drafts add column if not exists last_sync_status text;
alter table public.platform_listing_drafts add column if not exists last_synced_at timestamptz;
alter table public.platform_listing_drafts add column if not exists last_error text;

-- 4) สิทธิ์
insert into public.erp_permissions (key, label, category, is_dangerous, sort_order) values
  ('products.platforms.publish','ลงขายขึ้นแพลตฟอร์ม','📦 สินค้า (Products)',true,712),
  ('products.platforms.manage_accounts','จัดการร้าน/บัญชีแพลตฟอร์ม','📦 สินค้า (Products)',true,713)
on conflict (key) do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key from (values
  ('manager','products.platforms.publish'),('manager','products.platforms.manage_accounts')
) as r(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;
