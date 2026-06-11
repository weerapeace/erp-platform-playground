-- Design Sheets เฟส 4 — master วัสดุตีราคา + บรรทัดตีราคา + ลงทะเบียนโมดูล + เมนู
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_sheets_phase4) 2026-06-10

create table if not exists design_price_items (
  id                uuid primary key default gen_random_uuid(),
  code              text,
  name              text not null,
  material_group_id uuid references material_groups(id),
  price_per_unit    numeric,
  uom               text,
  face_width_cm     numeric,
  note              text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table design_price_items enable row level security;
create policy design_price_items_select on design_price_items for select using (true);

create table if not exists design_sheet_cost_lines (
  id            uuid primary key default gen_random_uuid(),
  sheet_id      uuid not null references design_sheets(id) on delete cascade,
  item_id       uuid references design_price_items(id),
  item_name     text,
  group_name    text,
  calc_method   text,
  width_cm      numeric, length_cm numeric, pieces numeric,
  face_width_cm numeric, waste_percent numeric, divisor numeric,
  qty           numeric, uom text, unit_price numeric, amount numeric,
  note          text, sort_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists design_sheet_cost_lines_sheet_idx on design_sheet_cost_lines (sheet_id);
alter table design_sheet_cost_lines enable row level security;
create policy design_sheet_cost_lines_select on design_sheet_cost_lines for select using (true);

-- + ลงทะเบียน erp_modules (module_key=design-price-items, table=design_price_items) + erp_module_fields 7 ฟิลด์
--   (code/name/material_group_id relation→material_groups/price_per_unit/uom/face_width_cm/note)
-- + เมนู erp_menu_items "🧮 วัสดุตีราคา" หมวด 🎨 ออกแบบสินค้า → /master/design-price-items
