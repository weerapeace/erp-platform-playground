-- SKU การตลาด: รายการ Parent SKU ที่ทีมการตลาดเลือกทำตลาด + ป้ายกลุ่ม (Hero / Clearance / Accessories …)
-- 1 รุ่น (parent_skus_v2) อยู่ในรายการได้ครั้งเดียว และติดได้ 1 ป้าย · แบรนด์อ่านจาก parent_skus_v2.brand_id (ไม่เก็บซ้ำ)

create table if not exists public.marketing_sku_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  color text not null default '#64748b',
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_marketing_sku_labels_name on public.marketing_sku_labels (lower(name));

create table if not exists public.marketing_skus (
  id uuid primary key default gen_random_uuid(),
  parent_sku_id uuid not null references public.parent_skus_v2(id) on delete cascade,
  label_id uuid references public.marketing_sku_labels(id) on delete set null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_marketing_skus_parent on public.marketing_skus (parent_sku_id);
create index if not exists ix_marketing_skus_label on public.marketing_skus (label_id);

-- เข้าผ่าน API (service role) เท่านั้น เหมือนตาราง marketing_* อื่น
alter table public.marketing_sku_labels enable row level security;
alter table public.marketing_skus enable row level security;

-- ป้ายตั้งต้น (แก้/เพิ่ม/ลบได้ที่หน้า SKU การตลาด → ตั้งค่าป้าย)
insert into public.marketing_sku_labels (name, icon, color, description, sort_order) values
  ('Hero Products', '🔥', '#f97316', 'สินค้าตัวชูโรง ดันขายเต็มที่', 10),
  ('Clearance Products', '🏷️', '#ef4444', 'สินค้าระบายสต๊อก', 20),
  ('Accessories Products', '👜', '#8b5cf6', 'สินค้าเสริม / ขายพ่วง', 30)
on conflict do nothing;

-- สิทธิ์
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('marketing.sku.view', 'ดู SKU การตลาด', 'Marketing', 'เปิดดูรายการสินค้าที่เลือกทำการตลาด แยกตามแบรนด์', false, 2060),
  ('marketing.sku.manage', 'จัดการ SKU การตลาด', 'Marketing', 'เพิ่ม/เอาออก/ติดป้าย สินค้าในรายการการตลาด', false, 2070),
  ('marketing.label.manage', 'ตั้งค่าป้าย SKU การตลาด', 'Marketing', 'เพิ่ม/แก้/ลบ ป้ายกลุ่มสินค้า เช่น Hero / Clearance', false, 2080)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'marketing.sku.view'), ('manager', 'marketing.sku.view'), ('staff', 'marketing.sku.view'),
  ('admin', 'marketing.sku.manage'), ('manager', 'marketing.sku.manage'), ('staff', 'marketing.sku.manage'),
  ('admin', 'marketing.label.manage'), ('manager', 'marketing.label.manage')
on conflict do nothing;

-- เมนูในแอปการตลาด (ต่อจาก Dashboard)
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys)
select 'การตลาด', 59, 12, '🎯', 'SKU การตลาด', '/marketing/skus', true, false, 'marketing.sku.view', true, array['marketing']
where not exists (select 1 from public.erp_menu_items where href = '/marketing/skus');
