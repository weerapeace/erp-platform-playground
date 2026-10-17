-- 📝 เลือกแทรกรายละเอียดลง Description + 🧵 หน้าวัสดุบนเว็บร้าน (เจ้าของเลือกแบบ A 2026-10-17)
--   กฎคิดบรรทัด: lib/detail-snippets.ts · ลิงก์วัสดุ: lib/product-materials.ts · ป๊อป: components/detail-insert.tsx
--
-- 1) product_highlight_items (ทะเบียน "รายละเอียดเพิ่ม" เดิม) เพิ่มชนิด
--      kind = 'phrase' ข้อความสำเร็จรูป (ของเดิมทั้งหมด) | 'slot' ช่อง + ตัวเลข ("ช่องใส่บัตรเครดิต 6 ช่อง")
--      template / template_en = รูปแบบบรรทัดของ slot ({n} = ตัวเลข · {name} = ชื่อ) · ว่าง = "{name} {n} ช่อง" / "{name} × {n}"
--    ของเดิม 4 แถว = phrase (ค่าเริ่มต้น) · ไม่แตะข้อมูลเดิม
-- 2) product_materials (ใหม่ · ตรวจแล้วไม่มีตารางชื่อนี้) = ทะเบียนวัสดุ + เนื้อหาหน้าวัสดุบนเว็บร้าน /materials/<slug>
--      aliases = คำเรียกอื่นที่ใช้ในคำอธิบายสินค้า (คั่นจุลภาค) → เว็บลิงก์ให้อัตโนมัติ
--      ลิงก์เฉพาะวัสดุที่เปิดใช้ + มีคำอธิบายแล้ว (กันลูกค้าเจอหน้าว่าง)
--      slug ว่าง = สร้างจากชื่ออังกฤษให้เอง (ไม่มีชื่ออังกฤษ = m-<รหัส>)
--    แก้/ลบที่ /m/product_materials (หน้าตารางกลาง) · อ่านได้เฉพาะคนล็อกอิน · เว็บร้านอ่านผ่าน API ของ ERP

alter table public.product_highlight_items add column if not exists kind text not null default 'phrase' check (kind in ('phrase', 'slot'));
alter table public.product_highlight_items add column if not exists template text;
alter table public.product_highlight_items add column if not exists template_en text;

create table public.product_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  name_en text,
  slug text not null default '',
  aliases text,
  image_key text,
  description text,
  description_en text,
  care text,
  care_en text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.product_materials is 'วัสดุ + หน้าวัสดุบนเว็บร้าน (/materials/<slug>) · aliases = คำเรียกอื่นที่ลิงก์อัตโนมัติ · lib/product-materials.ts';

-- slug: ว่าง → จากชื่ออังกฤษ (a-z0-9-) → ไม่มี = m-<รหัส 8 ตัว> · ชนกับแถวอื่น = ต่อท้ายรหัส 4 ตัว
create or replace function public.product_materials_slug() returns trigger language plpgsql set search_path = public as $$
declare s text;
begin
  s := lower(coalesce(nullif(trim(new.slug), ''), coalesce(new.name_en, '')));
  s := trim(both '-' from regexp_replace(s, '[^a-z0-9]+', '-', 'g'));
  if s = '' then s := 'm-' || substr(replace(new.id::text, '-', ''), 1, 8); end if;
  if exists (select 1 from public.product_materials p where p.slug = s and p.id <> new.id) then
    s := s || '-' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  new.slug := s;
  new.updated_at := now();
  return new;
end $$;
create trigger product_materials_slug before insert or update on public.product_materials
  for each row execute function public.product_materials_slug();
create unique index product_materials_slug_key on public.product_materials (slug);

alter table public.product_materials enable row level security;
create policy product_materials_sel_auth on public.product_materials for select to authenticated using (true);

-- ทะเบียนโมดูล → หน้าตารางกลาง /m/product_materials (เพิ่ม/แก้/ลบ)
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order)
select 'product_materials', 'product_materials', 'วัสดุ (หน้าเว็บ)', 'ทะเบียนวัสดุ + หน้าวัสดุบนเว็บร้าน · ชื่อวัสดุในคำอธิบายสินค้าลิงก์มาหน้านี้อัตโนมัติ', 'name', 'physical',
       '{"api_path":"/api/master-v2/product_materials","entity_type":"product_materials","icon":"🧵"}'::jsonb, true, 177
where not exists (select 1 from public.erp_modules where module_key = 'product_materials');

insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, is_searchable, width, display_order, show_in_form, options, help_text, placeholder, ui_style)
select m.id, v.field_key, v.field_key, v.label, v.label_en, v.ui, v.dt, 'physical', v.grp, v.visible, v.req, v.editable, false, v.sortable, v.searchable, v.width, v.ord, v.form, '{}'::jsonb, v.help, v.ph, v.us::jsonb
from public.erp_modules m
cross join (values
  ('name', 'ชื่อวัสดุ', 'Name', 'text', 'text', 'core', true, true, true, true, true, 200, 10, true, 'ชื่อที่ใช้ในคำอธิบายสินค้า เช่น หนังวัวนิ่มนัปป้า', null, '{"lang_en":"name_en","lang_translate":true}'),
  ('name_en', 'ชื่อวัสดุ (อังกฤษ)', 'Name (EN)', 'text', 'text', 'core', true, false, true, true, true, 180, 11, true, null, null, '{}'),
  ('slug', 'ชื่อในลิงก์', 'URL slug', 'text', 'text', 'core', true, false, true, true, true, 160, 20, true, 'ภาษาอังกฤษตัวเล็ก/ตัวเลข/ขีด เช่น nappa-leather · ว่าง = สร้างจากชื่ออังกฤษให้เอง', 'nappa-leather', '{}'),
  ('aliases', 'คำเรียกอื่น', 'Aliases', 'text', 'text', 'core', true, false, true, false, true, 220, 30, true, 'คั่นด้วยจุลภาค — คำเหล่านี้ในคำอธิบายสินค้าจะลิงก์มาหน้าวัสดุนี้ด้วย เช่น หนังนัปป้า, Nappa leather', 'หนังนัปป้า, Nappa leather', '{}'),
  ('image_key', 'รูปวัสดุ', 'Image', 'image', 'text', 'core', true, false, true, false, false, 90, 40, true, 'รูปบนหน้าวัสดุ (เช่น ภาพผิวหนังระยะใกล้)', null, '{}'),
  ('description', 'คำอธิบาย (หน้าวัสดุ)', 'Description', 'textarea', 'text', 'content', true, false, true, false, true, 260, 50, true, 'เขียนแล้วชื่อวัสดุในคำอธิบายสินค้าบนเว็บจะกดลิงก์มาหน้านี้ได้ · ว่าง = ยังไม่ลิงก์', null, '{"lang_en":"description_en","lang_translate":true,"rows":6}'),
  ('description_en', 'คำอธิบาย (อังกฤษ)', 'Description (EN)', 'textarea', 'text', 'content', false, false, true, false, false, 260, 51, true, null, null, '{"rows":6}'),
  ('care', 'วิธีดูแลรักษา', 'Care', 'textarea', 'text', 'content', false, false, true, false, false, 260, 60, true, 'ไม่ใส่ก็ได้ — มีแล้วหน้าวัสดุโชว์หัวข้อ "วิธีดูแลรักษา"', null, '{"lang_en":"care_en","lang_translate":true,"rows":4}'),
  ('care_en', 'วิธีดูแลรักษา (อังกฤษ)', 'Care (EN)', 'textarea', 'text', 'content', false, false, true, false, false, 260, 61, true, null, null, '{"rows":4}'),
  ('sort_order', 'ลำดับ', 'Sort order', 'number', 'numeric', 'core', true, false, true, true, false, 80, 70, true, null, null, '{}'),
  ('is_active', 'เปิดใช้', 'Active', 'boolean', 'boolean', 'other', true, false, true, true, false, 80, 80, true, null, null, '{}'),
  ('id', 'ID', 'ID', 'text', 'text', 'system', false, false, false, false, false, 120, 90, false, null, null, '{}'),
  ('created_at', 'สร้างเมื่อ', 'Created', 'date', 'date', 'system', false, false, false, true, false, 120, 100, false, null, null, '{}'),
  ('updated_at', 'แก้ล่าสุด', 'Updated', 'date', 'date', 'system', false, false, false, true, false, 120, 110, false, null, null, '{}')
) as v(field_key, label, label_en, ui, dt, grp, visible, req, editable, sortable, searchable, width, ord, form, help, ph, us)
where m.module_key = 'product_materials'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = v.field_key);

-- ทะเบียนฟิลด์ product_highlight_items: ชนิด + รูปแบบบรรทัด
insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, width, display_order, show_in_form, options, help_text, placeholder)
select m.id, v.field_key, v.field_key, v.label, v.label_en, v.ui, 'text', 'physical', 'core', true, false, true, v.filterable, v.filterable, v.width, v.ord, true, v.opts::jsonb, v.help, v.ph
from public.erp_modules m
cross join (values
  ('kind', 'ชนิด', 'Type', 'select', true, 130, 5, '{"options":["phrase","slot"],"labels":{"phrase":"ข้อความสำเร็จรูป","slot":"ช่อง + ตัวเลข"}}', 'ช่อง + ตัวเลข = ตอนแทรกพิมพ์แค่จำนวน เช่น "ช่องใส่บัตรเครดิต" + 6 → "ช่องใส่บัตรเครดิต 6 ช่อง"', null),
  ('template', 'รูปแบบบรรทัด (ช่อง)', 'Line template', 'text', false, 180, 25, '{}', 'เฉพาะชนิด "ช่อง" · {name} = ชื่อ · {n} = ตัวเลข · ว่าง = "{name} {n} ช่อง"', '{name} {n} ช่อง'),
  ('template_en', 'รูปแบบบรรทัด (อังกฤษ)', 'Line template (EN)', 'text', false, 180, 26, '{}', 'ว่าง = "{name} × {n}" (ใช้ชื่ออังกฤษ) · เช่น "{n} card slots"', '{n} card slots')
) as v(field_key, label, label_en, ui, filterable, width, ord, opts, help, ph)
where m.module_key = 'product_highlight_items'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = v.field_key);

-- ตั้งต้น: "ช่อง" ที่เจอบ่อยในคำอธิบายจริง (383 รุ่นมีบรรทัดช่อง) — แก้/ลบได้ที่ /m/product_highlight_items
insert into public.product_highlight_items (name, name_en, kind, template, template_en, sort_order, is_active)
select v.* from (values
  ('ช่องหลัก', 'Main compartment', 'slot', null, null, 100, true),
  ('ช่องซิปหลัก', 'Main zip compartment', 'slot', null, null, 110, true),
  ('ช่องใส่บัตรเครดิต', 'Card slot', 'slot', null, '{n} card slots', 120, true),
  ('ช่องใส่ธนบัตร', 'Bill compartment', 'slot', null, '{n} bill compartments', 130, true),
  ('ช่องอเนกประสงค์', 'Multipurpose pocket', 'slot', null, null, 140, true),
  ('ช่องซิปด้านหน้า', 'Front zip pocket', 'slot', null, null, 150, true),
  ('ช่องซิปซ่อน', 'Hidden zip pocket', 'slot', null, null, 160, true),
  ('ช่องด้านหลัง', 'Back pocket', 'slot', null, null, 170, true)
) as v(name, name_en, kind, template, template_en, sort_order, is_active)
where not exists (select 1 from public.product_highlight_items p where p.kind = 'slot');

-- ตั้งต้น: วัสดุที่เจอบ่อย (ยังไม่มีคำอธิบาย = ยังไม่ลิงก์บนเว็บ จนกว่าทีมจะเขียน)
insert into public.product_materials (name, name_en, slug, aliases, sort_order)
select v.* from (values
  ('หนังวัวนิ่มนัปป้า', 'Nappa cowhide leather', 'nappa-leather', 'หนังนัปป้า, Nappa leather', 10),
  ('หนังวัวเรียบรูขน', 'Smooth full-grain cowhide', 'smooth-cowhide', 'Full-grain cowhide', 20),
  ('หนังวัวซาเฟียโน่', 'Saffiano cowhide leather', 'saffiano-leather', 'หนังซาเฟียโน่, Saffiano leather', 30),
  ('ผ้าแคนวาส', 'Canvas', 'canvas', 'Canvas', 40),
  ('ผ้าไนล่อน', 'Nylon', 'nylon', 'Nylon', 50),
  ('โพลียูรีเทน', 'Polyurethane (PU)', 'polyurethane', 'Polyurethane', 60)
) as v(name, name_en, slug, aliases, sort_order)
where not exists (select 1 from public.product_materials);

-- เปิดปุ่ม "＋ แทรก" ที่ Description ของ Parent SKU (ทะเบียนฟิลด์ · components/master-crud อ่าน ui_style.insert_details)
update public.erp_module_fields f
set ui_style = coalesce(f.ui_style, '{}'::jsonb) || '{"insert_details": true}'::jsonb
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'parent-skus-v2' and f.field_key = 'description';
