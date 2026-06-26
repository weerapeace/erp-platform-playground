-- เฟส 1a: Product Platform Listing Manager (MVP ในบ้าน)
-- 1) เติม erp_platforms (Platform Registry) — icon/สี/ความสามารถ
alter table public.erp_platforms add column if not exists icon_key text;
alter table public.erp_platforms add column if not exists theme_color text;
alter table public.erp_platforms add column if not exists capabilities jsonb not null default '{}'::jsonb;

-- 2) ร่างลงขายต่อสินค้า×แพลตฟอร์ม
create table if not exists public.platform_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  parent_sku_id uuid not null,
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  title text,
  description text,
  category_path text,
  status text not null default 'not_started',
  validation jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_sku_id, platform_id)
);
create index if not exists idx_platform_listing_drafts_parent on public.platform_listing_drafts(parent_sku_id);
alter table public.platform_listing_drafts enable row level security;
drop policy if exists platform_listing_drafts_sel on public.platform_listing_drafts;
create policy platform_listing_drafts_sel on public.platform_listing_drafts for select to authenticated using (true);

-- 3) สิทธิ์
insert into public.erp_permissions (key, label, category, is_dangerous, sort_order) values
  ('products.platforms.view','ดูการลงขายหลายแพลตฟอร์ม','📦 สินค้า (Products)',false,710),
  ('products.platforms.edit','แก้ร่างลงขายหลายแพลตฟอร์ม','📦 สินค้า (Products)',false,711)
on conflict (key) do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key from (values
  ('manager','products.platforms.view'),('manager','products.platforms.edit'),
  ('staff','products.platforms.view'),('staff','products.platforms.edit')
) as r(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;
