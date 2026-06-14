-- ===== โกดัง QC เฟส 1 — แกนข้อมูลจริง =====
-- ชั้นวาง QC แยกจากสต็อกหลัก + ของบนชั้น + สาเหตุของเสีย + ตัวนับดึงเข้า QC + สิทธิ์ qc.*
create table if not exists public.qc_shelves (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'store' check (kind in ('store','defect')),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.qc_warehouse_items (
  id          uuid primary key default gen_random_uuid(),
  shelf_id    uuid not null references public.qc_shelves(id) on delete restrict,
  wo_id       uuid,                 -- ใบจ่ายงานต้นทาง (mo_work_orders)
  mo_no       text,
  sku         text,
  sku_name    text,
  worker      text,                 -- ช่างผลิต
  qty         numeric not null default 0,
  status      text not null default 'good' check (status in ('good','defect','repairing')),
  reason      text,                 -- สาเหตุของเสีย
  repair_by   text,                 -- ช่างซ่อม
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists qc_items_shelf_idx on public.qc_warehouse_items(shelf_id);
create index if not exists qc_items_wo_idx on public.qc_warehouse_items(wo_id);

create table if not exists public.qc_defect_reasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- คิวรอ QC = mo_work_orders.received_qty - qc_pulled_qty
alter table public.mo_work_orders add column if not exists qc_pulled_qty numeric not null default 0;

alter table public.qc_shelves          enable row level security;
alter table public.qc_warehouse_items  enable row level security;
alter table public.qc_defect_reasons   enable row level security;

-- สิทธิ์ qc.* แยกเฉพาะ + mirror grant จากผู้มีสิทธิ์ products
insert into public.erp_permissions (key, label, category, sort_order) values
  ('qc.view','ดูโกดัง QC','qc',10), ('qc.receive','รับเข้า QC','qc',20),
  ('qc.move','ย้ายชั้น QC','qc',30), ('qc.ship','ส่งออกจาก QC','qc',40),
  ('qc.defect','แยกของเสีย QC','qc',50), ('qc.repair','ส่งซ่อม/รับจากซ่อม','qc',60)
on conflict (key) do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
  select rp.role_key, 'qc.view' from public.erp_role_permissions rp where rp.permission_key='products.view'
on conflict do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
  select rp.role_key, t.perm from public.erp_role_permissions rp
  cross join (values ('qc.receive'),('qc.move'),('qc.ship'),('qc.defect'),('qc.repair')) as t(perm)
  where rp.permission_key='products.edit'
on conflict do nothing;

insert into public.qc_shelves (name, kind, sort_order) values
  ('ชั้น A — ของดีรอตรวจ','store',10), ('ชั้น B — ผ่าน QC แล้ว','store',20), ('ชั้นของเสีย รอซ่อม','defect',30);
insert into public.qc_defect_reasons (name, sort_order) values
  ('หนังมีตำหนิ',10), ('เย็บไม่เรียบ',20), ('สีเพี้ยน',30), ('โครงไม่ได้ขนาด',40), ('อื่น ๆ',99);
