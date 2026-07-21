-- ต้นทุนมาตรฐานของสินค้า (module คำนวณต้นทุน) — เก็บ scenario + สรุป + ประวัติเวอร์ชัน
-- anchor ด้วย code: target_type parent|sku, target_code = รหัส Parent/SKU (default ที่ Parent + override ราย SKU)
create table if not exists product_costings (
  id uuid primary key default gen_random_uuid(),
  target_type text not null default 'parent',      -- parent | sku
  target_code text not null,                         -- รหัส Parent SKU หรือ SKU ลูก
  qty_basis numeric not null default 1,              -- จำนวนที่ใช้คำนวณยอดรวม
  scenario jsonb not null default '{}'::jsonb,       -- CostScenario
  summary jsonb not null default '{}'::jsonb,        -- {material_pp,labor_pp,extras_pp,cost_pp,sell,profit_pp,margin_pct}
  note text,
  is_current boolean not null default true,          -- เวอร์ชันล่าสุดของ target นี้
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);
create index if not exists idx_product_costings_target on product_costings(target_type, target_code) where is_active;
create index if not exists idx_product_costings_current on product_costings(target_type, target_code) where is_current and is_active;
alter table product_costings enable row level security;
drop policy if exists "read product_costings" on product_costings;
create policy "read product_costings" on product_costings for select using (true);
