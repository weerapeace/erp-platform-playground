-- ✂️ วางแบบบนผ้าลาย (Fabric Lay) — อัลบั้มผ้าชิ้น + แบบตัดต่อสินค้า + แผนวางชิ้นบนผ้า → JPEG สรุป/ใบตัดผ้า
--
-- เจ้าของสั่ง 2026-11-28 (widget 2 รอบ → เลือก B + ข้อเสนอ 1,2,3,4,6,7,8,9,10,11) · คู่มือ docs/fabric-lay.md · สูตร lib/fabric-lay.ts
-- fabric_lay_fabrics  = ผ้าลายผืนจริง 1 ผืน: รูปถ่าย (photo_key) + รูปที่ดัดตรงแล้ว (image_key) + ขนาดจริง กว้าง×ยาว ซม.
--                       quad = 4 มุมผ้าในรูปถ่าย (แก้ใหม่ได้) · checks = จุดตรวจระยะ · used_area_cm2 = พื้นที่ที่ตัดไปแล้ว (รวมจากแผนที่กด "ตัดแล้ว")
-- fabric_lay_patterns = แบบตัดของกระเป๋า 1 แบบ ผูก Parent SKU (1 สินค้า = 1 แบบตัด) หรือใบงานออกแบบ (ยังไม่มี SKU)
--                       pieces jsonb = ชิ้นแบบ [{id,part,name,shape (lib/pattern-shape · ซม.),holes,count,mirror,allow,note,src}] ตรวจด้วย cleanLayPieces
-- fabric_lay_plans    = แผนวาง 1 แผนบนผ้า 1 ผืน (ผ้า 1 ผืนมีหลายแผนได้) · bags = กระเป๋าในแผน (หลายใบ) · items = ชิ้นที่วาง (ตำแหน่ง/หมุน/พลิก/โน้ต)
--                       cut_done_at = กด "ตัดแล้ว" → หักพื้นที่ออกจากผ้า (ยกเลิกได้)
-- ลบ = ลบแบบเก็บไว้ก่อน (is_active=false + deleted_at) · ลบถาวรได้เฉพาะในถังขยะ · ผ้าที่มีแผนอยู่ลบถาวรไม่ได้ (FK restrict)
-- RLS: เปิด ไม่มี policy = เข้าได้เฉพาะ service role ผ่าน API /api/fabric-lay/* (guardApi + audit)

create sequence if not exists public.fabric_lay_fabrics_seq;
create sequence if not exists public.fabric_lay_patterns_seq;
create sequence if not exists public.fabric_lay_plans_seq;

create table if not exists public.fabric_lay_fabrics (
  id              uuid primary key default gen_random_uuid(),
  code            text not null default ('FAB-' || lpad(nextval('public.fabric_lay_fabrics_seq')::text, 4, '0')),
  name            text not null,
  kind            text,
  note            text,
  photo_key       text,
  image_key       text,
  img_w           integer,
  img_h           integer,
  width_cm        numeric(8,2),
  height_cm       numeric(8,2),
  quad            jsonb,
  checks          jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),
  used_area_cm2   numeric(12,2) not null default 0,
  is_active       boolean not null default true,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index if not exists fabric_lay_fabrics_code_uq on public.fabric_lay_fabrics (code);
create index if not exists fabric_lay_fabrics_active_idx on public.fabric_lay_fabrics (is_active, updated_at desc);
comment on table public.fabric_lay_fabrics is 'วางแบบบนผ้า: อัลบั้มผ้าลายผืนจริง (รูปดัดตรง + ขนาดจริง) · lib/fabric-lay.ts';

create table if not exists public.fabric_lay_patterns (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null default ('CUT-' || lpad(nextval('public.fabric_lay_patterns_seq')::text, 4, '0')),
  name               text not null,
  parent_sku_id      uuid references public.parent_skus_v2(id) on delete set null,
  parent_code        text,
  design_sheet_id    uuid references public.design_sheets(id) on delete set null,
  design_sheet_code  text,
  bag_image          text,
  pattern_project_id uuid,
  pieces             jsonb not null default '[]'::jsonb check (jsonb_typeof(pieces) = 'array'),
  piece_count        integer generated always as (jsonb_array_length(pieces)) stored,
  note               text,
  is_active          boolean not null default true,
  created_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create unique index if not exists fabric_lay_patterns_code_uq on public.fabric_lay_patterns (code);
-- 1 สินค้า = 1 แบบตัด (นับเฉพาะที่ยังไม่ลบ)
create unique index if not exists fabric_lay_patterns_parent_uq on public.fabric_lay_patterns (parent_sku_id) where is_active and parent_sku_id is not null;
create unique index if not exists fabric_lay_patterns_sheet_uq on public.fabric_lay_patterns (design_sheet_id) where is_active and design_sheet_id is not null and parent_sku_id is null;
create index if not exists fabric_lay_patterns_active_idx on public.fabric_lay_patterns (is_active, updated_at desc);
comment on table public.fabric_lay_patterns is 'วางแบบบนผ้า: แบบตัดกระเป๋าต่อ Parent SKU / ใบงานออกแบบ · ชิ้น = lib/pattern-shape (ซม.)';

create table if not exists public.fabric_lay_plans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null default ('LAY-' || lpad(nextval('public.fabric_lay_plans_seq')::text, 4, '0')),
  name            text not null,
  fabric_id       uuid not null references public.fabric_lay_fabrics(id) on delete restrict,
  bags            jsonb not null default '[]'::jsonb check (jsonb_typeof(bags) = 'array'),
  items           jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  settings        jsonb not null default '{}'::jsonb,
  note            text,
  cut_area_cm2    numeric(12,2) not null default 0,
  cut_done_at     timestamptz,
  cut_done_by     text,
  is_active       boolean not null default true,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index if not exists fabric_lay_plans_code_uq on public.fabric_lay_plans (code);
create index if not exists fabric_lay_plans_fabric_idx on public.fabric_lay_plans (fabric_id, is_active);
comment on table public.fabric_lay_plans is 'วางแบบบนผ้า: แผนวางชิ้นของกระเป๋าหลายใบบนผ้า 1 ผืน · กดตัดแล้ว = หักพื้นที่ออกจากผ้า';

alter table public.fabric_lay_fabrics enable row level security;
alter table public.fabric_lay_patterns enable row level security;
alter table public.fabric_lay_plans enable row level security;

-- ─── สิทธิ์ ──────────────────────────────────────────────────────────────────
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('fabric_lay.view', 'ดูแอปวางแบบบนผ้า',       'ออกแบบ', 'เปิดดูอัลบั้มผ้า แบบตัด แผนวาง และโหลด JPEG สรุป/ใบตัดผ้า', false, 2470),
  ('fabric_lay.edit', 'สร้าง/แก้แอปวางแบบบนผ้า', 'ออกแบบ', 'เพิ่มผ้า ตั้งสเกล แก้แบบตัด วางชิ้น กดตัดแล้ว และลบ (ลบแบบกู้คืนได้)', false, 2480)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'fabric_lay.view'), ('manager', 'fabric_lay.view'), ('staff', 'fabric_lay.view'),
  ('admin', 'fabric_lay.edit'), ('manager', 'fabric_lay.edit'), ('staff', 'fabric_lay.edit'),
  ('designer', 'fabric_lay.view'), ('designer', 'fabric_lay.edit')
on conflict do nothing;

-- ─── เมนู: แอปออกแบบ + แอปผลิต หมวด "🎨 ออกแบบสินค้า" ───────────────────────
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher, app_overrides)
select '/master/fabric-lay', '✂️', 'วางแบบบนผ้าลาย', '🎨 ออกแบบสินค้า', array['design', 'production'], 16, 35, 'fabric_lay.view', true, true, true, '{}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/master/fabric-lay');

-- ─── ทะเบียนโมดูล (โผล่ใน "โมดูลทั้งหมด") ────────────────────────────────────
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'fabric_lay_plans', 'fabric_lay_plans', 'แผนวางแบบบนผ้า', 'แผนวางชิ้นกระเป๋าบนผ้าลาย (หน้าจริง /master/fabric-lay)', 'name', 'physical',
       '{"api_path":"/api/fabric-lay/plans","entity_type":"fabric_lay_plans","icon":"✂️","page_href":"/master/fabric-lay"}'::jsonb, true, 977, 'ออกแบบ'
where not exists (select 1 from public.erp_modules where module_key = 'fabric_lay_plans');
