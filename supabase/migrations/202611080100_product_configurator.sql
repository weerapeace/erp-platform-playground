-- 👜 ตัวประกอบสินค้า (Product Configurator) — ก้อน 1: ฐานข้อมูลกลาง
--
-- ลูกค้าเลือกตัวเลือกทีละช่อง แล้วเห็นรูปสินค้าที่ประกอบจากรูปถ่ายพื้นใสหลายชั้น (เริ่มที่กระเป๋า IG International)
-- ต่างจาก Belt Builder: ชนิดชิ้นส่วน/ช่องตัวเลือก/ชั้นรูป เป็น "ข้อมูล" ที่แอดมินตั้งเอง ไม่มีรายการตายตัวในโค้ด
--
-- ตรวจแล้ว (2026-10-29): to_regclass ของทั้ง 7 ตาราง = null → สร้างใหม่ได้ (กัน memory migration_if_not_exists_trap)
--
-- configurator_models       = ทรง (สินค้า 1 แบบ) + มุมที่เปิด + ผืนผ้าใบ + ค่าแม่แบบถ่ายรูปต่อมุม
-- configurator_slots        = ช่องตัวเลือก (วัสดุ / สี / ซิป / ซับใน / ปั๊มชื่อ …) · single / multi / text
-- configurator_options      = ตัวเลือกในช่อง + ราคาเพิ่ม + วันผลิตเพิ่ม + สีตัวอย่าง
-- configurator_layers       = ชั้นรูปต่อมุม · depends_on = ช่องที่ทำให้รูปเปลี่ยน · show_when = เงื่อนไขโชว์
-- configurator_layer_images = ไฟล์รูปของชั้นตามคอมโบตัวเลือก (combo_key เช่น PEBBLE_NOIR)
-- configurator_rules        = กติกา: ถ้าเลือก A → ช่อง Y เลือก B ไม่ได้ (block) / ได้เฉพาะ B (only)
-- configurator_designs      = แบบที่ลูกค้าบันทึก (ก้อน 3–4 ใช้)
-- กฎคิด/ตรวจ = lib/product-configurator.ts (pure + test) · API = app/api/configurator/* · หลังบ้าน = /admin/product-configurator
-- RLS: เปิด ไม่มี policy = เข้าได้เฉพาะ service role ผ่าน API (แบบเดียวกับ belt_*)
-- รหัส (code) ทุกตาราง: ตัวใหญ่ A-Z ตัวเลข "-" (ห้าม "_" เพราะใช้คั่นชื่อไฟล์รูป TOTE_FRONT_BODY_PEBBLE_NOIR.png)

-- ─── 1) ทรง ──────────────────────────────────────────────────────────────────
create table if not exists public.configurator_models (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  code            text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
  name_th         text not null,
  name_en         text,
  description     text,
  size_text       text,
  base_price      numeric(12, 2) not null default 0 check (base_price >= 0),   -- 0 = ให้ลูกค้าสอบถามราคา
  lead_days       integer not null default 0 check (lead_days >= 0),
  views           text[] not null default array['front'] check (cardinality(views) > 0 and views <@ array['front','back','inside','side']),
  canvas          jsonb not null default '{"w":3000,"h":3000}'::jsonb check (canvas ? 'w' and canvas ? 'h'),
  view_config     jsonb not null default '{}'::jsonb,                          -- {front:{ground_y,cm_px,markers[],camera_note}}
  cover_image_key text,
  sort_order      integer not null default 100,
  is_active       boolean not null default false,                              -- ทรงใหม่ปิดไว้ก่อน ลูกค้ายังไม่เห็น
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index if not exists configurator_models_shop_code_uq on public.configurator_models (shop_id, code) where deleted_at is null;
create index if not exists configurator_models_shop_idx on public.configurator_models (shop_id, sort_order);
comment on table public.configurator_models is 'ตัวประกอบสินค้า: ทรง (สินค้า 1 แบบ) · มุมที่เปิด + ผืนผ้าใบ + ค่าแม่แบบถ่ายรูป · lib/product-configurator.ts';

-- ─── 2) ช่องตัวเลือก ─────────────────────────────────────────────────────────
create table if not exists public.configurator_slots (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references public.configurator_models(id) on delete cascade,
  code        text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
  name_th     text not null,
  name_en     text,
  help_th     text,
  kind        text not null default 'single' check (kind in ('single', 'multi', 'text')),
  required    boolean not null default true,
  step_view   text check (step_view is null or step_view in ('front','back','inside','side')),
  config      jsonb not null default '{}'::jsonb,                               -- text: {max_chars, charset, auto_upper, placeholder}
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists configurator_slots_model_code_uq on public.configurator_slots (model_id, code);
comment on table public.configurator_slots is 'ตัวประกอบสินค้า: ช่องตัวเลือกของทรง (single/multi/text) · เรียงตาม sort_order = ลำดับขั้นที่ลูกค้าเห็น';

-- ─── 3) ตัวเลือก ─────────────────────────────────────────────────────────────
create table if not exists public.configurator_options (
  id               uuid primary key default gen_random_uuid(),
  model_id         uuid not null references public.configurator_models(id) on delete cascade,
  slot_id          uuid not null references public.configurator_slots(id) on delete cascade,
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
  name_th          text not null,
  name_en          text,
  note_th          text,
  price_delta      numeric(12, 2) not null default 0 check (price_delta >= 0),
  lead_days        integer not null default 0 check (lead_days >= 0),
  swatch_hex       text check (swatch_hex is null or swatch_hex ~* '^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$'),
  swatch_image_key text,
  attrs            jsonb not null default '{}'::jsonb,                          -- {text_style: deboss|gold|silver|ink}
  is_default       boolean not null default false,
  sort_order       integer not null default 100,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index if not exists configurator_options_slot_code_uq on public.configurator_options (slot_id, code) where deleted_at is null;
create index if not exists configurator_options_model_idx on public.configurator_options (model_id);
comment on table public.configurator_options is 'ตัวประกอบสินค้า: ตัวเลือกในช่อง + ราคาเพิ่ม + วันผลิตเพิ่ม + สีตัวอย่าง (swatch_hex ใช้ลงสีรูปกลางด้วย)';

-- ─── 4) ชั้นรูป ──────────────────────────────────────────────────────────────
create table if not exists public.configurator_layers (
  id           uuid primary key default gen_random_uuid(),
  model_id     uuid not null references public.configurator_models(id) on delete cascade,
  view         text not null check (view in ('front','back','inside','side')),
  code         text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
  name_th      text not null,
  z_index      integer not null default 100,                                    -- ล่าง → บน
  depends_on   text[] not null default '{}',                                    -- รหัสช่อง เช่น {MATERIAL,COLOR} → 1 ไฟล์ต่อคอมโบ
  show_when    jsonb not null default '[]'::jsonb,                              -- [{slot,options[]}] ทุกข้อต้องตรง
  recolor_slot text,                                                            -- ลงสีรูปกลางตามสีตัวอย่างของช่องนี้ (แทนการถ่ายทุกสี)
  text_slot    text,                                                            -- ชั้นตัวอักษรพิมพ์สด (ไม่มีไฟล์รูป)
  config       jsonb not null default '{}'::jsonb,                              -- {text:{x,y,size,style_slot,letter_spacing}}
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists configurator_layers_model_view_code_uq on public.configurator_layers (model_id, view, code);
comment on table public.configurator_layers is 'ตัวประกอบสินค้า: ชั้นรูปต่อมุม · ชื่อไฟล์ = {ทรง}_{มุม}_{ชั้น}_{ตัวเลือกตาม depends_on}.png';

-- ─── 5) รูปของชั้น ───────────────────────────────────────────────────────────
create table if not exists public.configurator_layer_images (
  id          uuid primary key default gen_random_uuid(),
  layer_id    uuid not null references public.configurator_layers(id) on delete cascade,
  combo_key   text not null default '' check (combo_key ~ '^([A-Z0-9][A-Z0-9-]*(_[A-Z0-9][A-Z0-9-]*)*)?$'),
  image_key   text not null,                                                    -- R2 key (โฟลเดอร์ configurator-parts)
  width       integer,
  height      integer,
  file_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists configurator_layer_images_combo_uq on public.configurator_layer_images (layer_id, combo_key);
comment on table public.configurator_layer_images is 'ตัวประกอบสินค้า: ไฟล์รูปพื้นใสของชั้นตามคอมโบตัวเลือก (ขนาดเท่าผืนผ้าใบของทรง)';

-- ─── 6) กติกา ────────────────────────────────────────────────────────────────
create table if not exists public.configurator_rules (
  id           uuid primary key default gen_random_uuid(),
  model_id     uuid not null references public.configurator_models(id) on delete cascade,
  kind         text not null default 'block' check (kind in ('block', 'only')),
  if_slot      text not null,
  if_options   text[] not null default '{}',                                    -- ว่าง = แค่เลือกอะไรก็ได้ในช่องนี้
  then_slot    text not null check (then_slot <> if_slot),
  then_options text[] not null check (cardinality(then_options) > 0),
  reason_th    text,                                                            -- เหตุผลที่ลูกค้าเห็น
  sort_order   integer not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists configurator_rules_model_idx on public.configurator_rules (model_id, sort_order);
comment on table public.configurator_rules is 'ตัวประกอบสินค้า: กติกาการเลือก block = เลือกไม่ได้ · only = เลือกได้เฉพาะ (อ้างรหัสช่อง/ตัวเลือก)';

-- ─── 7) แบบของลูกค้า ─────────────────────────────────────────────────────────
create table if not exists public.configurator_designs (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  model_id     uuid references public.configurator_models(id) on delete set null,
  code         text not null unique,                                            -- รหัสแบบ XXXX-XXXX ให้ลูกค้าส่งแอดมิน
  member_id    uuid,
  selections   jsonb not null default '{}'::jsonb,                              -- {SLOT: OPTION | [OPTIONS] | ข้อความ}
  total_price  numeric(12, 2) not null default 0 check (total_price >= 0),
  lead_days    integer not null default 0,
  status       text not null default 'saved' check (status in ('saved', 'in_cart', 'ordered')),
  order_ref    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists configurator_designs_shop_idx on public.configurator_designs (shop_id, status, created_at desc);
comment on table public.configurator_designs is 'ตัวประกอบสินค้า: แบบที่ลูกค้าบันทึก/ใส่ตะกร้า/สั่ง · ราคาคิดซ้ำฝั่ง ERP ทุกครั้ง';

-- ─── RLS: service-only ───────────────────────────────────────────────────────
alter table public.configurator_models       enable row level security;
alter table public.configurator_slots        enable row level security;
alter table public.configurator_options      enable row level security;
alter table public.configurator_layers       enable row level security;
alter table public.configurator_layer_images enable row level security;
alter table public.configurator_rules        enable row level security;
alter table public.configurator_designs      enable row level security;

-- ─── สิทธิ์ ──────────────────────────────────────────────────────────────────
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('configurator.view', 'ดูตัวประกอบสินค้า', 'เว็บไซต์', 'เปิดดูทรง ช่องตัวเลือก ชั้นรูป กติกา และแบบที่ลูกค้าบันทึก ของตัวประกอบสินค้า', false, 2130),
  ('configurator.edit', 'แก้ตัวประกอบสินค้า', 'เว็บไซต์', 'เพิ่ม/แก้/ลบ ทรง ตัวเลือก ราคา ชั้นรูป รูป และกติกาของตัวประกอบสินค้า', false, 2140)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'configurator.view'), ('manager', 'configurator.view'), ('staff', 'configurator.view'),
  ('admin', 'configurator.edit'), ('manager', 'configurator.edit')
on conflict do nothing;

-- ─── เมนู (หมวด 🌐 เว็บไซต์ ต่อจากออกแบบเข็มขัด) ─────────────────────────────
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys)
select '🌐 เว็บไซต์', 95, 30, '👜', 'ตัวประกอบสินค้า (ออกแบบเอง)', '/admin/product-configurator', true, false, 'configurator.view', true, array['marketplace', 'home']
where not exists (select 1 from public.erp_menu_items where href = '/admin/product-configurator');

-- ─── ทะเบียนโมดูล (โผล่ใน "โมดูลทั้งหมด") ────────────────────────────────────
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'configurator_models', 'configurator_models', 'ตัวประกอบสินค้า — ทรง', 'ทรงสินค้าที่ลูกค้าออกแบบเองได้ (หน้าจริง /admin/product-configurator)', 'name_th', 'physical',
       '{"api_path":"/api/configurator/models","entity_type":"configurator_models","icon":"👜","page_href":"/admin/product-configurator"}'::jsonb, true, 963, 'เว็บไซต์'
where not exists (select 1 from public.erp_modules where module_key = 'configurator_models');

insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'configurator_designs', 'configurator_designs', 'ตัวประกอบสินค้า — แบบของลูกค้า', 'แบบที่ลูกค้าออกแบบ/บันทึก/สั่ง (อ่านอย่างเดียว)', 'code', 'physical',
       '{"api_path":"/api/configurator/designs","entity_type":"configurator_designs","icon":"🧾","page_href":"/admin/product-configurator"}'::jsonb, true, 964, 'เว็บไซต์'
where not exists (select 1 from public.erp_modules where module_key = 'configurator_designs');
