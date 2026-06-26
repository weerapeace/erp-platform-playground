-- รับออเดอร์จากแพลตฟอร์ม เฟส 1a — ออเดอร์ + รายการ + สถานะ + ตัดสต๊อก (ใช้ ledger เดิม)
create table if not exists public.platform_orders (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  brand_id uuid,
  account_id uuid,
  external_order_id text,
  order_no text,
  customer_name text,
  status text not null default 'new',          -- new | confirmed | packed | shipped | cancelled
  total numeric,
  currency text,
  ordered_at timestamptz,
  tracking_no text,
  carrier text,
  stock_deducted boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  source text not null default 'import',        -- import | api
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, external_order_id)
);
create index if not exists idx_platform_orders_platform on public.platform_orders(platform_id);
create index if not exists idx_platform_orders_status on public.platform_orders(status);
alter table public.platform_orders enable row level security;
drop policy if exists platform_orders_sel on public.platform_orders;
create policy platform_orders_sel on public.platform_orders for select to authenticated using (true);

create table if not exists public.platform_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.platform_orders(id) on delete cascade,
  sku_code text,
  matched_sku_id uuid,
  name text,
  qty numeric not null default 1,
  price numeric,
  raw jsonb not null default '{}'::jsonb
);
create index if not exists idx_platform_order_items_order on public.platform_order_items(order_id);
alter table public.platform_order_items enable row level security;
drop policy if exists platform_order_items_sel on public.platform_order_items;
create policy platform_order_items_sel on public.platform_order_items for select to authenticated using (true);

-- สิทธิ์
insert into public.erp_permissions (key, label, category, is_dangerous, sort_order) values
  ('platform_orders.view','ดูออเดอร์จากแพลตฟอร์ม','📦 สินค้า (Products)',false,720),
  ('platform_orders.manage','จัดการออเดอร์ (นำเข้า/ยืนยัน/ส่ง/ตัดสต๊อก)','📦 สินค้า (Products)',false,721)
on conflict (key) do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key from (values
  ('manager','platform_orders.view'),('manager','platform_orders.manage'),
  ('staff','platform_orders.view'),('staff','platform_orders.manage')
) as r(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;
