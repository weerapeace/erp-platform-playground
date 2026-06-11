-- Design Sheets เฟส 1 — ใบงานออกแบบสินค้าใหม่ (ตารางหลัก + เลขรัน + เมนู)
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_sheets_phase1) 2026-06-10
create table if not exists design_sheets (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  brand_id        uuid references brands(id),
  detail          text,
  note            text,
  status          text not null default 'design',
  order_date      date,
  deadline        date,
  drive_link      text,
  parent_sku_code text,
  is_active       boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists design_sheets_brand_idx  on design_sheets (brand_id);
create index if not exists design_sheets_status_idx on design_sheets (status);

alter table design_sheets enable row level security;
drop policy if exists design_sheets_select on design_sheets;
create policy design_sheets_select on design_sheets for select using (true);

-- กฎเลขรัน DS-{YYYY}-{0000}
insert into erp_numbering_rules (key, label, pattern, reset_policy, current_value, active)
select 'ds', 'ใบงานออกแบบ (Design Sheet)', 'DS-{YYYY}-{0000}', 'yearly', 0, true
where not exists (select 1 from erp_numbering_rules where key = 'ds');

-- เมนูหมวดใหม่ 🎨 ออกแบบสินค้า
insert into erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, is_active)
select '🎨 ออกแบบสินค้า', 35, 10, '🎨', 'Design Sheets', '/master/design-sheets', true, true, true
where not exists (select 1 from erp_menu_items where href = '/master/design-sheets');
