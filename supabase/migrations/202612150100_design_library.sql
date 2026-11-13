-- 📚 Design Library — คลังแม่แบบกระเป๋า → ปรับ "สูตร" → ใบสรุป PDF + prompt ให้ GPT → อัปรูปที่ได้กลับมาเก็บเป็นเวอร์ชัน
--
-- เจ้าของสั่ง 2026-11-13 (ดู widget 3 รอบ แล้ว "ทำเลย") · ใช้ภายในทีม (ต่างจากตัวประกอบสินค้า configurator_* ที่ให้ลูกค้าเว็บร้านออกแบบ)
-- แยกจาก design_sheets โดยตั้งใจ (ใบงานถูกอ่านจากรายงาน/อีเมล/MO/ค้นหาเยอะ — สูตรที่ยังเป็นไอเดียไม่ควรปนเข้าไป)
--
-- design_library_templates = แม่แบบ (รูปจริง + รูปลายเส้นสลับดูได้ + ขนาดตั้งต้น)
-- design_library_recipes   = สูตรที่ปรับจากแม่แบบ · spec jsonb = จุดบนรูป + สิ่งที่เลือก (เก็บสำเนาชื่อ/รหัส/รูป ณ ตอนเลือก) + ช่อง + ขนาด
-- design_library_choices   = รายการตัวเลือกที่ทีมเพิ่ม/แก้/ลบเองได้ (หมวด · สีอะไหล่ · สีด้าย · แบบช่อง · กฎห้ามคู่)
-- design_library_renders   = รูปที่ได้จาก GPT ต่อสูตร ต่อชุดมุม · version เพิ่มทีละ 1 · ใครอัป เมื่อไหร่
-- กฎคิด/ตรวจ = lib/design-library.ts (pure + test) · API = app/api/design-library/* · หน้า = /master/design-library
-- RLS: เปิด ไม่มี policy = เข้าได้เฉพาะ service role ผ่าน API (แบบเดียวกับ configurator_*)

create table if not exists public.design_library_templates (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
  name               text not null,
  description        text,
  category           text,                                                  -- ทรง เช่น โท้ท / สะพายข้าง (ข้อความอิสระ ใช้กรอง)
  image_key          text,                                                  -- รูปจริง (R2)
  image_w            integer,
  image_h            integer,
  vector_image_key   text,                                                  -- รูปลายเส้น/vector (สลับดู) ไม่บังคับ
  default_spec       jsonb not null default '{}'::jsonb,                    -- {size:{w,h,d,strap}, pockets:{...}}
  sort_order         integer not null default 100,
  is_active          boolean not null default true,
  created_by         uuid,
  created_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create unique index if not exists design_library_templates_code_uq on public.design_library_templates (code) where deleted_at is null;
comment on table public.design_library_templates is 'Design Library: แม่แบบกระเป๋า (รูปจริง + ลายเส้น) · lib/design-library.ts';

create table if not exists public.design_library_recipes (
  id                 uuid primary key default gen_random_uuid(),
  template_id        uuid not null references public.design_library_templates(id) on delete cascade,
  seq                integer not null default 1,                            -- สูตร #1 #2 … ต่อแม่แบบ
  name               text,
  note               text,
  spec               jsonb not null default '{}'::jsonb,                    -- {size, hw_color, pins:[…], pockets:{front,back,inside_front,inside_back}}
  is_active          boolean not null default true,
  created_by         uuid,
  created_by_name    text,
  updated_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index if not exists design_library_recipes_tpl_idx on public.design_library_recipes (template_id, seq);
comment on table public.design_library_recipes is 'Design Library: สูตรที่ปรับจากแม่แบบ (จุดบนรูป + วัสดุ/สี/ช่อง/ขนาด) → ใบสรุป PDF + prompt';

create table if not exists public.design_library_choices (
  id          uuid primary key default gen_random_uuid(),
  list_key    text not null check (list_key in ('category', 'hw_color', 'thread_color', 'pocket_type', 'rule')),
  code        text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),
  name        text not null,
  name_en     text,                                                         -- ใช้ใน prompt ภาษาอังกฤษ
  hex         text check (hex is null or hex ~* '^#[0-9a-f]{6}$'),
  config      jsonb not null default '{}'::jsonb,                           -- category: {source}; rule: {a_list,a_code,b_list,b_code,reason}
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists design_library_choices_uq on public.design_library_choices (list_key, code);
comment on table public.design_library_choices is 'Design Library: รายการตัวเลือกที่ทีมแก้เองได้ (หมวด/สีอะไหล่/สีด้าย/แบบช่อง/กฎห้ามคู่)';

create table if not exists public.design_library_renders (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references public.design_library_recipes(id) on delete cascade,
  view_key         text not null check (view_key in ('grid4', 'inside', 'model', 'other')),
  version          integer not null default 1,
  image_key        text not null,
  note             text,
  is_active        boolean not null default true,
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists design_library_renders_recipe_idx on public.design_library_renders (recipe_id, view_key, version desc);
comment on table public.design_library_renders is 'Design Library: รูปที่ได้จาก GPT ต่อสูตร ต่อชุดมุม (เวอร์ชันซ้อน · ใครอัป)';

alter table public.design_library_templates enable row level security;
alter table public.design_library_recipes   enable row level security;
alter table public.design_library_choices   enable row level security;
alter table public.design_library_renders   enable row level security;

-- ─── ตัวเลือกตั้งต้น (ทีมแก้/ลบ/เพิ่มได้ที่หน้า ⚙️ ตัวเลือก) ─────────────────────
-- หมวด: source = แหล่งที่ใช้เลือก · swatch = แผงผ้า · sku = SKU · color = รหัสสี (สีด้าย) · logo = อัปโหลด/คลังโลโก้ · sku_text = SKU หรือเขียนเอง
insert into public.design_library_choices (list_key, code, name, name_en, config, sort_order) values
  ('category', 'body',    'ตัวกระเป๋า',    'Body material',  '{"source":"swatch"}',   10),
  ('category', 'handle',  'หูหิ้ว / สาย',  'Handle / strap', '{"source":"swatch"}',   20),
  ('category', 'hw',      'อะไหล่',        'Hardware',       '{"source":"sku","hw":true}', 30),
  ('category', 'tape',    'เทป',           'Edge tape',      '{"source":"swatch"}',   40),
  ('category', 'zip',     'ซิป',           'Zipper',         '{"source":"swatch"}',   50),
  ('category', 'logo',    'โลโก้',         'Logo',           '{"source":"logo"}',     60),
  ('category', 'lining',  'ซับใน',         'Lining',         '{"source":"swatch"}',   70),
  ('category', 'thread',  'ด้ายเย็บ',      'Stitching thread','{"source":"color","color_list":"thread_color"}', 80),
  ('category', 'bottom',  'ก้น / หมุดรอง', 'Bottom',         '{"source":"sku","hw":true}', 90),
  ('category', 'other',   'อื่น ๆ',        'Extra detail',   '{"source":"sku_text"}', 100)
on conflict (list_key, code) do nothing;

insert into public.design_library_choices (list_key, code, name, name_en, hex, sort_order) values
  ('hw_color', 'gold',   'ทอง',           'gold',          '#c9a24a', 10),
  ('hw_color', 'silver', 'เงิน',          'silver',        '#b8b8b8', 20),
  ('hw_color', 'black',  'ดำด้าน',        'matte black',   '#3a3a3a', 30),
  ('hw_color', 'brass',  'ทองเหลืองรมดำ', 'antique brass', '#8a6d3b', 40),
  ('hw_color', 'rose',   'โรสโกลด์',      'rose gold',     '#c98f7a', 50)
on conflict (list_key, code) do nothing;

insert into public.design_library_choices (list_key, code, name, name_en, sort_order) values
  ('pocket_type', 'zip',  'ซิป',        'zip',       10),
  ('pocket_type', 'slip', 'ช่องเสียบ',  'open slip', 20),
  ('pocket_type', 'flap', 'ฝาปิด',      'flap',      30),
  ('pocket_type', 'snap', 'กระดุมแป๊ก', 'snap',      40)
on conflict (list_key, code) do nothing;
-- สีด้าย (thread_color) + กฎห้ามคู่ (rule) เริ่มว่าง — ทีมใส่รหัสสีจริงเอง

-- ─── สิทธิ์ ──────────────────────────────────────────────────────────────────
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('design_library.view',   'ดู Design Library',          'ออกแบบ', 'เปิดดูคลังแม่แบบกระเป๋า สูตร ใบสรุป PDF และรูปที่ได้', false, 2410),
  ('design_library.edit',   'สร้าง/แก้สูตร Design Library', 'ออกแบบ', 'สร้างสูตรจากแม่แบบ เลือกวัสดุ/สี/ช่อง อัปรูปที่ได้จาก GPT', false, 2420),
  ('design_library.manage', 'จัดการแม่แบบและตัวเลือก',      'ออกแบบ', 'เพิ่ม/แก้/ลบ แม่แบบ และรายการตัวเลือก (หมวด สีอะไหล่ สีด้าย แบบช่อง กฎห้ามคู่)', false, 2430)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'design_library.view'), ('manager', 'design_library.view'), ('staff', 'design_library.view'),
  ('admin', 'design_library.edit'), ('manager', 'design_library.edit'), ('staff', 'design_library.edit'),
  ('admin', 'design_library.manage'), ('manager', 'design_library.manage')
on conflict do nothing;

-- ─── เมนู: แอปออกแบบ หมวด "🎨 ออกแบบสินค้า" (เห็นเฉพาะคนที่มี design_library.view) ─────
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher, app_overrides)
select '/master/design-library', '📚', 'Design Library', '🎨 ออกแบบสินค้า', array['design'], 12, 35, 'design_library.view', true, true, true, '{}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/master/design-library');

-- ─── ทะเบียนโมดูล (โผล่ใน "โมดูลทั้งหมด" — กู้คืนแม่แบบ/สูตรที่ลบได้ที่นั่น) ──────────
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'design_library_templates', 'design_library_templates', 'Design Library — แม่แบบ', 'แม่แบบกระเป๋า (หน้าจริง /master/design-library)', 'name', 'physical',
       '{"api_path":"/api/design-library/templates","entity_type":"design_library_templates","icon":"📚","page_href":"/master/design-library"}'::jsonb, true, 970, 'ออกแบบ'
where not exists (select 1 from public.erp_modules where module_key = 'design_library_templates');

insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'design_library_recipes', 'design_library_recipes', 'Design Library — สูตร', 'สูตรที่ปรับจากแม่แบบ (แก้ที่หน้าสูตร)', 'seq', 'physical',
       '{"api_path":"/api/design-library/recipes","entity_type":"design_library_recipes","icon":"🧾","page_href":"/master/design-library"}'::jsonb, true, 971, 'ออกแบบ'
where not exists (select 1 from public.erp_modules where module_key = 'design_library_recipes');
