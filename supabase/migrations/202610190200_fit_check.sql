-- 📐 เช็คว่าใส่ของ/ตุ๊กตาได้ไหม (รอบ A: ข้อมูล) — กฎคิด lib/fit-check.ts
--
-- product_fit_items (ทะเบียน "ใส่อะไรได้บ้าง" เดิม) + ขนาดมาตรฐาน:
--   kind           = 'item' ของใช้ (เดิม · ติ๊กเอง) | 'doll' ตุ๊กตา/ฟิกเกอร์ (คำนวณจากช่องใส่ของอัตโนมัติ)
--   width/height/depth_cm = ขนาดมาตรฐาน (ว่าง = คำนวณไม่ได้ ใช้ติ๊กเองแบบเดิม)
--   is_soft        = นุ่ม บีบได้ (ตุ๊กตาผ้า → เผื่อให้ ~10%)
--   size_estimated = ขนาดเป็นค่าประมาณ (ยังไม่ได้วัดของจริง) → หน้าเว็บบอกลูกค้าว่า "ประมาณ"
-- parent_skus_v2.compartments = ช่องใส่ของ (ขนาดด้านใน) [{id,name,w,h,d,window}]
--   null = ยังไม่ได้วัด (ร้านที่เปิดเช็คขนาด จะขึ้นในแท็บ ⚠️ ต้องแก้) · [] = ไม่มีช่องใส่ของ (ไม่ใช่กระเป๋า)
-- ตรวจแล้ว: ไม่มีคอลัมน์ชื่อนี้อยู่ก่อน · ค่าเริ่มต้นไม่แตะข้อมูลเดิม

alter table public.product_fit_items add column if not exists kind text not null default 'item' check (kind in ('item', 'doll'));
alter table public.product_fit_items add column if not exists width_cm numeric(6, 1) check (width_cm is null or width_cm > 0);
alter table public.product_fit_items add column if not exists height_cm numeric(6, 1) check (height_cm is null or height_cm > 0);
alter table public.product_fit_items add column if not exists depth_cm numeric(6, 1) check (depth_cm is null or depth_cm > 0);
alter table public.product_fit_items add column if not exists is_soft boolean not null default false;
alter table public.product_fit_items add column if not exists size_estimated boolean not null default false;

alter table public.parent_skus_v2 add column if not exists compartments jsonb;
comment on column public.parent_skus_v2.compartments is 'ช่องใส่ของ ขนาดด้านใน [{id,name,w,h,d,window}] · null=ยังไม่วัด · []=ไม่มีช่อง (lib/fit-check.ts)';

-- ทะเบียนฟิลด์: ให้หน้า /m/product_fit_items แก้ช่องใหม่ได้ + ฟอร์ม Parent SKU มีช่องใส่ของ
insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, width, display_order, show_in_form, options, help_text, placeholder)
select m.id, v.field_key, v.field_key, v.label, v.label_en, v.ui, v.dt, 'physical', 'core', v.visible, false, true, v.filterable, v.sortable, v.width, v.ord, true, v.opts::jsonb, v.help, v.ph
from public.erp_modules m
cross join (values
  ('kind', 'ประเภท', 'Type', 'select', 'text', true, true, false, 110, 32, '{"options":["item","doll"],"labels":{"item":"ของใช้ (ติ๊กเอง)","doll":"ตุ๊กตา / ฟิกเกอร์ (คำนวณเอง)"}}', 'ตุ๊กตา = ระบบคำนวณจากช่องใส่ของของกระเป๋าให้เอง (ต้องใส่ขนาด)', null),
  ('width_cm', 'กว้าง (ซม.)', 'Width (cm)', 'number', 'numeric', true, false, true, 90, 34, '{}', 'ขนาดมาตรฐาน · ว่าง = คำนวณไม่ได้', null),
  ('height_cm', 'สูง (ซม.)', 'Height (cm)', 'number', 'numeric', true, false, true, 90, 35, '{}', null, null),
  ('depth_cm', 'หนา (ซม.)', 'Depth (cm)', 'number', 'numeric', true, false, true, 90, 36, '{}', null, null),
  ('is_soft', 'นุ่ม บีบได้', 'Soft', 'boolean', 'boolean', true, true, false, 90, 37, '{}', 'ตุ๊กตาผ้า/พวงกุญแจผ้า — ระบบเผื่อให้ประมาณ 10% (ขึ้นว่า "พอดี แน่น")', null),
  ('size_estimated', 'ขนาดประมาณ', 'Estimated size', 'boolean', 'boolean', true, true, false, 100, 38, '{}', 'ติ๊ก = ยังไม่ได้วัดของจริง หน้าเว็บจะบอกลูกค้าว่าเป็นค่าประมาณ · วัดแล้วเอาติ๊กออก', null)
) as v(field_key, label, label_en, ui, dt, visible, filterable, sortable, width, ord, opts, help, ph)
where m.module_key = 'product_fit_items'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = v.field_key);

insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, width, display_order, show_in_form, options, help_text)
select m.id, 'compartments', 'compartments', 'ช่องใส่ของ (ขนาดด้านใน)', 'Compartments (inner size)', 'json', 'jsonb', 'physical', 'content', false, false, true, false, false, 200, 137, true, '{}'::jsonb,
       'วัดขนาดด้านในของแต่ละช่อง · ใช้คำนวณว่าใส่ตุ๊กตา/ของอะไรได้ · ไม่ใช่กระเป๋า = กด "ไม่มีช่องใส่ของ"'
from public.erp_modules m
where m.module_key = 'parent-skus-v2'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = 'compartments');

-- ตุ๊กตายอดนิยม (ขนาดประมาณจากร้านค้าออนไลน์ — size_estimated = true ให้ทีมวัดของจริงแล้วแก้)
insert into public.product_fit_items (name, name_en, kind, width_cm, height_cm, depth_cm, is_soft, size_estimated, sort_order, is_active)
select v.* from (values
  ('Labubu พวงกุญแจ (~17 ซม.)', 'Labubu keychain (~17 cm)', 'doll', 9.5::numeric, 17::numeric, 7::numeric, true, true, 200, true),
  ('Crybaby พวงกุญแจ (~11 ซม.)', 'Crybaby keychain (~11 cm)', 'doll', 8, 11, 6, true, true, 210, true),
  ('ตุ๊กตาพวงกุญแจเล็ก (~10 ซม.)', 'Small plush keychain (~10 cm)', 'doll', 7, 10, 5, true, true, 220, true),
  ('ฟิกเกอร์กล่องสุ่ม (~9 ซม.)', 'Blind box figure (~9 cm)', 'doll', 5.5, 9, 5, false, true, 230, true),
  ('ตุ๊กตาผ้า 30 ซม.', 'Plush doll 30 cm', 'doll', 18, 30, 12, true, true, 240, true)
) as v(name, name_en, kind, width_cm, height_cm, depth_cm, is_soft, size_estimated, sort_order, is_active)
where not exists (select 1 from public.product_fit_items p where p.kind = 'doll');
