-- Field Mapping: ฟิลด์ ERP (source_key) → ฟิลด์ของแพลตฟอร์ม (platform_field_key)
create table if not exists public.platform_field_mappings (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  platform_field_key text not null,
  source_key text,
  const_value text,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, platform_field_key)
);
alter table public.platform_field_mappings enable row level security;
drop policy if exists platform_field_mappings_sel on public.platform_field_mappings;
create policy platform_field_mappings_sel on public.platform_field_mappings for select to authenticated using (true);
