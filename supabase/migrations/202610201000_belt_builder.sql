-- 🧵 Belt Builder (Louis Montini) — ก้อน 1: ฐานข้อมูล "ออกแบบเข็มขัดเอง"
--
-- ตรวจแล้ว (2026-10-16): to_regclass('public.belt_parts' / 'belt_size_rules' / 'belt_designs') = null ทั้ง 3 → สร้างใหม่ได้
-- (กฎ memory migration_if_not_exists_trap: ถ้ามีตารางชื่อซ้ำอยู่ก่อน create if not exists จะข้ามเงียบ)
--
-- belt_parts      = ชิ้นส่วนให้ลูกค้าเลือก (สายหนัง / หัว / หู) + รูป PNG พื้นโปร่ง + จุดยึดบนผืนผ้าใบ 1600×600 + ราคาเพิ่ม
-- belt_size_rules = กติกาไซซ์ต่อเพศ (ช่วงเอว นิ้ว) + สูตรตัดหนัง {mult, add_cm} + จำนวนรู/ระยะรู
-- belt_designs    = แบบที่ลูกค้าออกแบบ (selections jsonb) → saved / in_cart / ordered (ก้อน 3-4 ใช้)
-- กฎคิด/ตรวจ = lib/belt-builder.ts (pure) · API = app/api/belt-builder/* · หลังบ้าน = /admin/belt-builder
-- RLS: เปิด ไม่มี policy = เข้าได้เฉพาะ service role ผ่าน API (มาตรฐาน memory rls_security_remediation เฟส 1)

-- ─── 1) ชิ้นส่วน ─────────────────────────────────────────────────────────────
create table if not exists public.belt_parts (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  part_type     text not null check (part_type in ('strap', 'buckle', 'keeper')),
  code          text,                                  -- strap-black-35 · buckle-pin-silver · keeper-leather-match
  name_th       text not null,
  name_en       text,
  image_key     text,                                  -- R2 key (คลังไฟล์กลาง) PNG พื้นโปร่ง · null = ยังไม่อัปโหลด (พรีวิวใช้กล่องสี)
  image_url     text,                                  -- ลิงก์รูปภายนอก (สำรอง ถ้าไม่ใช้คลังไฟล์)
  anchor        jsonb not null default '{"x":0,"y":0,"w":100,"h":100}'::jsonb
                check (anchor ? 'x' and anchor ? 'y' and anchor ? 'w' and anchor ? 'h'),
  attrs         jsonb not null default '{}'::jsonb,    -- {color, color_hex, width_mm, shape, metal, style ...}
  price_delta   numeric(12, 2) not null default 0 check (price_delta >= 0),
  sort_order    integer not null default 100,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create unique index if not exists belt_parts_shop_code_uq on public.belt_parts (shop_id, code) where code is not null and deleted_at is null;
create index if not exists belt_parts_shop_type_idx on public.belt_parts (shop_id, part_type, sort_order);
comment on table public.belt_parts is 'Belt Builder: ชิ้นส่วนเข็มขัด (strap/buckle/keeper) + รูป PNG โปร่ง + anchor บนผืนผ้าใบ 1600×600 · lib/belt-builder.ts';
comment on column public.belt_parts.anchor is '{x,y,w,h} px บนผืนผ้าใบ 1600×600 — ค่าเริ่ม strap 0,300,1600,150 · buckle 0,225,200,300 · keeper 235,255,65,210';

-- ─── 2) กติกาไซซ์ ────────────────────────────────────────────────────────────
create table if not exists public.belt_size_rules (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  gender          text not null check (gender in ('men', 'women')),
  label           text,                                 -- ชื่อที่โชว์ลูกค้า เช่น "ผู้ชาย"
  waist_min_in    numeric(5, 1) not null check (waist_min_in > 0),
  waist_max_in    numeric(5, 1) not null check (waist_max_in > waist_min_in),
  strap_formula   jsonb not null default '{"mult":2.54,"add_cm":24}'::jsonb
                  check (strap_formula ? 'mult' and strap_formula ? 'add_cm'),
  hole_count      integer not null default 5 check (hole_count >= 1),
  hole_spacing_cm numeric(5, 2) not null default 2.5 check (hole_spacing_cm > 0),
  note            text,
  sort_order      integer not null default 100,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists belt_size_rules_shop_idx on public.belt_size_rules (shop_id, gender);
comment on table public.belt_size_rules is 'Belt Builder: กติกาไซซ์ต่อเพศ — ความยาวหนัง (ซม.) = เอว(นิ้ว) × mult + add_cm · รูกลางตรงรอบเอว';

-- ─── 3) แบบที่ลูกค้าออกแบบ ───────────────────────────────────────────────────
create table if not exists public.belt_designs (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  member_id     uuid,                                   -- สมาชิกเว็บร้าน (ยังไม่มีตาราง → ไม่ผูก FK) · null = ลูกค้าไม่ล็อกอิน
  selections    jsonb not null default '{}'::jsonb,     -- {strap_id, buckle_id, keeper_id, engraving:{text,font,position}, waist_in, gender, width_mm}
  total_price   numeric(12, 2) not null default 0 check (total_price >= 0),
  preview_url   text,
  status        text not null default 'saved' check (status in ('saved', 'in_cart', 'ordered')),
  order_ref     text,                                   -- เลขใบสั่งขายเมื่อ ordered (ก้อนถัดไป)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists belt_designs_shop_status_idx on public.belt_designs (shop_id, status, created_at desc);
comment on table public.belt_designs is 'Belt Builder: แบบที่ลูกค้าออกแบบไว้ · selections อ้าง belt_parts.id · ไหลเข้าใบสั่งขายในก้อนถัดไป';

-- ─── RLS: service-only ───────────────────────────────────────────────────────
alter table public.belt_parts      enable row level security;
alter table public.belt_size_rules enable row level security;
alter table public.belt_designs    enable row level security;

-- ─── สิทธิ์ ──────────────────────────────────────────────────────────────────
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('belt_builder.view', 'ดูตั้งค่าออกแบบเข็มขัด', 'เว็บไซต์', 'เปิดดูชิ้นส่วน / กติกาไซซ์ / แบบที่ลูกค้าบันทึก ของ Belt Builder', false, 2110),
  ('belt_builder.edit', 'แก้ตั้งค่าออกแบบเข็มขัด', 'เว็บไซต์', 'เพิ่ม/แก้/ลบ ชิ้นส่วน รูป จุดยึด ราคา และกติกาไซซ์ของ Belt Builder', false, 2120)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'belt_builder.view'), ('manager', 'belt_builder.view'), ('staff', 'belt_builder.view'),
  ('admin', 'belt_builder.edit'), ('manager', 'belt_builder.edit')
on conflict do nothing;

-- ─── เมนู (หมวด 🌐 เว็บไซต์ ต่อจาก "สินค้าบนเว็บ") ────────────────────────
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, is_active, app_keys)
select '🌐 เว็บไซต์', 95, 20, '🧵', 'ออกแบบเข็มขัด (Belt Builder)', '/admin/belt-builder', true, false, 'belt_builder.view', true, array['marketplace', 'home']
where not exists (select 1 from public.erp_menu_items where href = '/admin/belt-builder');

-- ─── ทะเบียนโมดูล (โผล่ใน "โมดูลทั้งหมด" · Field Registry) ─────────────────
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'belt_parts', 'belt_parts', 'Belt Builder — ชิ้นส่วน', 'สายหนัง / หัว / หู ให้ลูกค้าเลือกออกแบบเข็มขัด (หน้าจริง /admin/belt-builder)', 'name_th', 'physical',
       '{"api_path":"/api/belt-builder/parts","entity_type":"belt_parts","icon":"🧵","page_href":"/admin/belt-builder"}'::jsonb, true, 960, 'เว็บไซต์'
where not exists (select 1 from public.erp_modules where module_key = 'belt_parts');

insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'belt_size_rules', 'belt_size_rules', 'Belt Builder — กติกาไซซ์', 'ช่วงเอวชาย/หญิง + สูตรตัดหนัง (หน้าจริง /admin/belt-builder แท็บกติกาไซซ์)', 'label', 'physical',
       '{"api_path":"/api/belt-builder/size-rules","entity_type":"belt_size_rules","icon":"📏","page_href":"/admin/belt-builder"}'::jsonb, true, 961, 'เว็บไซต์'
where not exists (select 1 from public.erp_modules where module_key = 'belt_size_rules');

insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'belt_designs', 'belt_designs', 'Belt Builder — แบบของลูกค้า', 'แบบเข็มขัดที่ลูกค้าออกแบบ/บันทึก/สั่ง (อ่านอย่างเดียว)', 'status', 'physical',
       '{"api_path":"/api/belt-builder/designs","entity_type":"belt_designs","icon":"🧾","page_href":"/admin/belt-builder"}'::jsonb, true, 962, 'เว็บไซต์'
where not exists (select 1 from public.erp_modules where module_key = 'belt_designs');

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable, show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, v.fk, v.fk, v.lbl, v.lbl_en, v.ui, v.dt, 'core', v.vis, v.req, v.edit, v.srch, v.filt, true, true, 1, v.ord, v.opts::jsonb, '{}'::jsonb, v.help
from public.erp_modules m
cross join (values
  ('part_type',   'ประเภท',        'Type',        'select',   'text',    true,  true,  true,  false, true,  10, '{"options":["strap","buckle","keeper"],"labels":{"strap":"สายหนัง","buckle":"หัวเข็มขัด","keeper":"หูเข็มขัด"}}', 'ชั้น 1 สายหนัง · ชั้น 2 หู · ชั้น 3 หัว'),
  ('code',        'รหัส',          'Code',        'text',     'text',    true,  false, true,  true,  false, 20, '{}', 'strap-{สี}-{กว้าง} · buckle-{ทรง}-{สีโลหะ} · keeper-{แบบ}-{สี}'),
  ('name_th',     'ชื่อ (ไทย)',     'Name (TH)',   'text',     'text',    true,  true,  true,  true,  false, 30, '{}', null),
  ('name_en',     'ชื่อ (อังกฤษ)',  'Name (EN)',   'text',     'text',    true,  false, true,  true,  false, 40, '{}', null),
  ('image_key',   'รูป PNG โปร่ง',  'Image',       'image',    'text',    true,  false, true,  false, false, 50, '{}', 'ถ่ายบนพื้นขาวแล้วไดคัทเป็น PNG พื้นโปร่ง'),
  ('anchor',      'จุดยึด {x,y,w,h}', 'Anchor',    'json',     'jsonb',   false, true,  true,  false, false, 60, '{}', 'ตำแหน่งบนผืนผ้าใบ 1600×600 px'),
  ('attrs',       'คุณสมบัติ',      'Attributes',  'json',     'jsonb',   false, false, true,  false, false, 70, '{}', 'เช่น {"color":"ดำ","width_mm":35}'),
  ('price_delta', 'ราคาเพิ่ม (฿)',  'Price delta', 'currency', 'numeric', true,  false, true,  false, false, 80, '{"currency":"THB"}', '0 = ไม่บวกราคา'),
  ('sort_order',  'ลำดับ',          'Sort',        'number',   'integer', true,  false, true,  false, false, 90, '{}', null)
) as v(fk, lbl, lbl_en, ui, dt, vis, req, edit, srch, filt, ord, opts, help)
where m.module_key = 'belt_parts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = v.fk);

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable, show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, v.fk, v.fk, v.lbl, v.lbl_en, v.ui, v.dt, 'core', v.vis, v.req, true, false, v.filt, true, true, 1, v.ord, v.opts::jsonb, '{}'::jsonb, v.help
from public.erp_modules m
cross join (values
  ('gender',          'เพศ',             'Gender',        'select', 'text',    true,  true,  true,  10, '{"options":["men","women"],"labels":{"men":"ผู้ชาย","women":"ผู้หญิง"}}', null),
  ('label',           'ชื่อที่โชว์',      'Label',         'text',   'text',    true,  false, false, 20, '{}', null),
  ('waist_min_in',    'เอวต่ำสุด (นิ้ว)', 'Waist min (in)','number', 'numeric', true,  true,  false, 30, '{}', null),
  ('waist_max_in',    'เอวสูงสุด (นิ้ว)', 'Waist max (in)','number', 'numeric', true,  true,  false, 40, '{}', null),
  ('strap_formula',   'สูตรตัดหนัง',      'Strap formula', 'json',   'jsonb',   false, true,  false, 50, '{}', 'ความยาวหนัง (ซม.) = เอว(นิ้ว) × mult + add_cm'),
  ('hole_count',      'จำนวนรู',          'Holes',         'number', 'integer', true,  true,  false, 60, '{}', null),
  ('hole_spacing_cm', 'ระยะรู (ซม.)',     'Hole spacing',  'number', 'numeric', true,  true,  false, 70, '{}', null)
) as v(fk, lbl, lbl_en, ui, dt, vis, req, filt, ord, opts, help)
where m.module_key = 'belt_size_rules'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = v.fk);

-- ─── Seed ตัวอย่าง (Louis Montini) — รูปเป็น placeholder (image_key null) แอดมินอัปโหลดจริงทีหลัง ─
-- สายหนัง 6 สี × 2 ความกว้าง (35 / 40 มม.)
insert into public.belt_parts (shop_id, part_type, code, name_th, name_en, anchor, attrs, price_delta, sort_order)
select s.id, 'strap', 'strap-' || c.key || '-' || w.mm, 'สาย' || c.th || ' ' || w.mm || ' มม.', c.en || ' ' || w.mm || 'mm',
       '{"x":0,"y":300,"w":1600,"h":150}'::jsonb,
       jsonb_build_object('color', c.key, 'color_th', c.th, 'color_hex', c.hex, 'width_mm', w.mm),
       w.delta, c.ord * 10 + w.ord
from public.shops s
cross join (values
  ('black',    'ดำ',          'Black',       '#1f1f1f', 1),
  ('darkbrown','น้ำตาลเข้ม',  'Dark Brown',  '#4a2c17', 2),
  ('tan',      'น้ำตาลอ่อน',  'Tan',         '#b07a46', 3),
  ('cognac',   'คอนยัค',      'Cognac',      '#8a4b2a', 4),
  ('navy',     'กรมท่า',      'Navy',        '#1f2a44', 5),
  ('burgundy', 'เบอร์กันดี',  'Burgundy',    '#5c1a2a', 6)
) as c(key, th, en, hex, ord)
cross join (values ('35', 0::numeric, 1), ('40', 100::numeric, 2)) as w(mm, delta, ord)
where s.slug = 'louismontini'
  and not exists (select 1 from public.belt_parts p where p.shop_id = s.id and p.part_type = 'strap');

-- หัวเข็มขัด 4 ทรง × 4 สีโลหะ
insert into public.belt_parts (shop_id, part_type, code, name_th, name_en, anchor, attrs, price_delta, sort_order)
select s.id, 'buckle', 'buckle-' || sh.key || '-' || m.key, 'หัว' || sh.th || ' ' || m.th, sh.en || ' · ' || m.en,
       '{"x":0,"y":225,"w":200,"h":300}'::jsonb,
       jsonb_build_object('shape', sh.key, 'shape_th', sh.th, 'metal', m.key, 'metal_th', m.th, 'metal_hex', m.hex),
       m.delta, sh.ord * 10 + m.ord
from public.shops s
cross join (values
  ('pin',    'เข็มกลม',   'Pin buckle',    1),
  ('plate',  'เพลทเรียบ', 'Plate buckle',  2),
  ('roller', 'โรลเลอร์',  'Roller buckle', 3),
  ('auto',   'ออโต้เลื่อน','Automatic',    4)
) as sh(key, th, en, ord)
cross join (values
  ('silver',   'เงิน',      'Silver',    '#c9cbd1', 0::numeric,   1),
  ('gold',     'ทอง',       'Gold',      '#d4af37', 200::numeric, 2),
  ('gunmetal', 'ดำรมควัน',  'Gunmetal',  '#4b4f57', 100::numeric, 3),
  ('rosegold', 'โรสโกลด์',  'Rose Gold', '#d9a28f', 250::numeric, 4)
) as m(key, th, en, hex, delta, ord)
where s.slug = 'louismontini'
  and not exists (select 1 from public.belt_parts p where p.shop_id = s.id and p.part_type = 'buckle');

-- หูเข็มขัด 4 แบบ
insert into public.belt_parts (shop_id, part_type, code, name_th, name_en, anchor, attrs, price_delta, sort_order)
select s.id, 'keeper', 'keeper-' || k.key || '-' || k.color, k.th, k.en,
       '{"x":235,"y":255,"w":65,"h":210}'::jsonb,
       jsonb_build_object('style', k.key, 'color', k.color), k.delta, k.ord
from public.shops s
cross join (values
  ('leather', 'match',  'หูหนังสีเดียวกับสาย',   'Leather loop (match)',  0::numeric,  1),
  ('double',  'match',  'หูหนังคู่',              'Double leather loop',   50::numeric, 2),
  ('stitched','match',  'หูหนังเดินด้าย',         'Stitched loop',         80::numeric, 3),
  ('metal',   'silver', 'หูโลหะสีเงิน',           'Metal loop (silver)',   120::numeric, 4)
) as k(key, color, th, en, delta, ord)
where s.slug = 'louismontini'
  and not exists (select 1 from public.belt_parts p where p.shop_id = s.id and p.part_type = 'keeper');

-- กติกาไซซ์ ชาย 28–46 นิ้ว · หญิง 24–38 นิ้ว (สูตรชั่วคราว ×2.54 + 24 ซม. ตั้งค่าได้)
insert into public.belt_size_rules (shop_id, gender, label, waist_min_in, waist_max_in, strap_formula, hole_count, hole_spacing_cm, sort_order)
select s.id, g.gender, g.label, g.mn, g.mx, '{"mult":2.54,"add_cm":24}'::jsonb, 5, 2.5, g.ord
from public.shops s
cross join (values ('men', 'ผู้ชาย', 28::numeric, 46::numeric, 1), ('women', 'ผู้หญิง', 24::numeric, 38::numeric, 2)) as g(gender, label, mn, mx, ord)
where s.slug = 'louismontini'
  and not exists (select 1 from public.belt_size_rules r where r.shop_id = s.id);
