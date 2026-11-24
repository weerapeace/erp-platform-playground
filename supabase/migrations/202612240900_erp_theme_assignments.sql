-- ธีมกลาง ERP เฟส 3 — แอปไหนใช้ธีมไหน (docs/erp-theme.md)
--   scope = 'company' (ธีมบริษัท = ค่าเริ่มของทุกแอป) | 'app:<erp_app_groups.key>'
--   ไม่มีแถว = ใช้ค่าถัดไป (แอป → บริษัท → หน้าตาเดิมของระบบ)
--   on delete restrict = ลบธีมที่ยังมีแอปใช้ไม่ได้ (กันพังระดับฐานข้อมูล)
-- อ่าน/เขียนผ่าน API (service role) เท่านั้น
create table if not exists public.erp_theme_assignments (
  scope           text primary key check (scope = 'company' or scope like 'app:%'),
  theme_id        uuid not null references public.erp_themes(id) on delete restrict,
  updated_by      uuid,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
create index if not exists erp_theme_assignments_theme_idx on public.erp_theme_assignments (theme_id);
alter table public.erp_theme_assignments enable row level security;
revoke all on public.erp_theme_assignments from anon;
