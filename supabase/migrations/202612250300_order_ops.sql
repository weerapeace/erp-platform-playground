-- งานหลังขาย: คำสั่งพิเศษออเดอร์ + รายการรอของ + ซ่อม/คืนสินค้า
-- ย้ายมาจากแอปเก่า order-instruction-manager / repair-and-return (เจ้าของเลือก 2026-11-24 · แบบ A + โหมดทดลอง)
-- ทุกตาราง: is_trial = ข้อมูลทดลอง (ล้างได้ทีเดียว) · deleted_at = ถังขยะ (ลบแบบเก็บไว้ก่อน)
-- legacy_ref = เลขอ้างอิงจากแอปเก่า กันนำเข้าซ้ำ · อ่าน/เขียนผ่าน API (service role) เท่านั้น

create table if not exists public.order_instructions (
  id uuid primary key default gen_random_uuid(),
  platform_order_id uuid references public.platform_orders(id) on delete set null,
  order_no text not null,
  platform text,
  customer_name text,
  sku text,
  commands text[] not null default '{}',
  engrave boolean not null default false,
  engrave_text text,
  engrave_type text,
  engrave_position text,
  note text,
  status text not null default 'todo' check (status in ('todo','done')),
  done_at timestamptz,
  done_by_name text,
  print_count int not null default 0,
  last_printed_at timestamptz,
  is_trial boolean not null default false,
  legacy_ref text,
  deleted_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_instructions_order_no_idx on public.order_instructions (order_no);
create index if not exists order_instructions_po_idx on public.order_instructions (platform_order_id);
create index if not exists order_instructions_list_idx on public.order_instructions (status, created_at desc) where deleted_at is null;
create unique index if not exists order_instructions_legacy_uq on public.order_instructions (legacy_ref) where legacy_ref is not null;

create table if not exists public.order_waitlist (
  id uuid primary key default gen_random_uuid(),
  platform_order_id uuid references public.platform_orders(id) on delete set null,
  order_no text,
  platform text,
  customer_name text,
  sku text,
  note text,
  informed boolean not null default false,
  informed_at timestamptz,
  informed_by_name text,
  is_trial boolean not null default false,
  legacy_ref text,
  deleted_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_waitlist_list_idx on public.order_waitlist (informed, created_at desc) where deleted_at is null;
create unique index if not exists order_waitlist_legacy_uq on public.order_waitlist (legacy_ref) where legacy_ref is not null;

create table if not exists public.after_sales_cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('repair','return')),
  platform_order_id uuid references public.platform_orders(id) on delete set null,
  order_no text not null,
  customer_name text,
  sku text,
  qty int not null default 1 check (qty > 0),
  topic text,
  detail text,
  resolution text,
  status text not null,
  replacement_sku text,
  shipping_charge numeric(12,2),
  shipping_refund numeric(12,2),
  bank_info text,
  shipping_address text,
  return_date date,
  images jsonb not null default '[]'::jsonb,
  packed_at timestamptz,
  shipped_back_at timestamptz,
  checked_at timestamptz,
  stock_received_at timestamptz,
  stock_received_by_name text,
  zort_cancelled_at timestamptz,
  note text,
  is_trial boolean not null default false,
  legacy_ref text,
  deleted_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists after_sales_cases_list_idx on public.after_sales_cases (kind, status, created_at desc) where deleted_at is null;
create index if not exists after_sales_cases_order_no_idx on public.after_sales_cases (order_no);
create unique index if not exists after_sales_cases_legacy_uq on public.after_sales_cases (legacy_ref) where legacy_ref is not null;

-- รายการตัวเลือกที่ตั้งเองได้ (คำสั่งพิเศษ / หัวข้อซ่อม)
create table if not exists public.order_ops_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('instruction_command','repair_topic')),
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, label)
);

insert into public.order_ops_options (kind, label, sort_order)
select 'instruction_command', x.label, x.ord from unnest(array['ห่อ','การ์ดธรรมดา','การ์ดพิเศษ','แก้ไซส์เข็มขัด','ตัดชื่อออก','เปลี่ยนสินค้า','อื่นๆ']) with ordinality as x(label, ord)
on conflict (kind, label) do nothing;
insert into public.order_ops_options (kind, label, sort_order)
select 'repair_topic', x.label, x.ord from unnest(array['มีตำหนิ','ขาด/ชำรุด','เปลี่ยนรุ่นสินค้า','ปัญหาสาย','ขนาด: สั้นไป','ขนาด: ยาวไป','เปลี่ยนไซส์','หัวเข็มขัดพัง','ส่งผิดสี','ส่งผิดรุ่น','หนัง / PU ลอก / เสื่อม','ซิป / อะไหล่','ของหาย','ของไม่ครบ','อื่น ๆ']) with ordinality as x(label, ord)
on conflict (kind, label) do nothing;

-- ปิดการเข้าตรง (ข้อมูลลูกค้า/ที่อยู่/บัญชี) — ใช้ผ่าน API ที่ตรวจสิทธิ์เท่านั้น
alter table public.order_instructions enable row level security;
alter table public.order_waitlist enable row level security;
alter table public.after_sales_cases enable row level security;
alter table public.order_ops_options enable row level security;
revoke all on public.order_instructions, public.order_waitlist, public.after_sales_cases, public.order_ops_options from anon, authenticated;

-- สิทธิ์
insert into public.erp_permissions (key, label, category, sort_order, is_dangerous) values
  ('order_ops.view', 'ดูคำสั่งพิเศษ / ซ่อม-คืนสินค้า', '📦 สินค้า (Products)', 740, false),
  ('order_ops.edit', 'เพิ่ม/แก้ คำสั่งพิเศษ / ซ่อม-คืนสินค้า', '📦 สินค้า (Products)', 741, false),
  ('order_ops.delete', 'ลบ (ย้ายลงถังขยะ) คำสั่งพิเศษ / ซ่อม-คืน', '📦 สินค้า (Products)', 742, false),
  ('order_ops.manage', 'ตั้งค่าตัวเลือก + ล้างข้อมูลทดลอง + นำเข้าข้อมูลเก่า', '📦 สินค้า (Products)', 743, true)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('staff', 'order_ops.view'), ('staff', 'order_ops.edit'),
  ('manager', 'order_ops.view'), ('manager', 'order_ops.edit'), ('manager', 'order_ops.delete'), ('manager', 'order_ops.manage'),
  ('admin', 'order_ops.view'), ('admin', 'order_ops.edit'), ('admin', 'order_ops.delete'), ('admin', 'order_ops.manage')
on conflict do nothing;

-- เมนูในแอป "ออเดอร์ออนไลน์" (marketplace) ต่อจาก แพ็คสินค้า
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher)
select '/order-ops/instructions', 'i:gift', 'คำสั่งพิเศษ', 'งานขายออนไลน์', array['marketplace'], 22, 20, 'order_ops.view', true, true, true
where not exists (select 1 from public.erp_menu_items where href = '/order-ops/instructions');
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher)
select '/order-ops/after-sales', 'i:tool', 'ซ่อม / คืนสินค้า', 'งานขายออนไลน์', array['marketplace'], 23, 20, 'order_ops.view', true, true, true
where not exists (select 1 from public.erp_menu_items where href = '/order-ops/after-sales');
