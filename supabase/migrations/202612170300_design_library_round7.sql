-- 📚 Design Library รอบ 7 (2026-11-14 · เจ้าของเลือกหลังดู widget)
-- 1) รายการตัวเลือกใหม่: logo_method (วิธีทำโลโก้ + แบบย่อย + คำเตือน) · accessory (ส่วนเสริม มีรูป ผูก SKU ได้)
-- 2) หมวดของจุดได้ "แท็ก" (กรองแผงผ้า + รายการวัสดุในป๊อปเลือก) · ด้ายเย็บเลือกจาก SKU ด้ายจริง (THREAD-xx) แทนรายการรหัสสีที่ว่างอยู่
-- 3) ใส่วิธีทำโลโก้ตั้งต้นตามรายการที่เจ้าของส่งมา (เฉพาะถ้ายังไม่มี · แก้/ลบได้ที่ "ตัวเลือก")
alter table public.design_library_choices drop constraint if exists design_library_choices_list_key_check;
alter table public.design_library_choices add constraint design_library_choices_list_key_check
  check (list_key = any (array['bag_type','category','hw_color','thread_color','pocket_type','rule','prompt','logo_method','accessory']));

-- แท็กของหมวด (ใส่เฉพาะหมวดที่ยังไม่ได้ตั้ง)
update public.design_library_choices set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('tags', t.tags)
from (values ('zip', '["ซิป"]'::jsonb), ('tape', '["สาย/เทป"]'::jsonb), ('hw', '["อะไหล่"]'::jsonb), ('bottom', '["อะไหล่"]'::jsonb),
             ('body', '["ผ้า","หนัง","PU"]'::jsonb), ('lining', '["ผ้า"]'::jsonb), ('handle', '["หนัง","PU","สาย/เทป"]'::jsonb)) as t(code, tags)
where list_key = 'category' and design_library_choices.code = t.code and not (coalesce(config, '{}'::jsonb) ? 'tags');

-- ด้ายเย็บ: เลือกจาก SKU ด้าย (ปุ่มลัดตามเบอร์) + แผงการ์ดสีด้ายได้ถ้ามี
update public.design_library_choices
set config = coalesce(config, '{}'::jsonb) || '{"source":"sku","chips":["เบอร์ 20=THREAD-20","เบอร์ 25=THREAD-25","เบอร์ 30=THREAD-30","เบอร์ 40=THREAD-40","เบอร์ 60=THREAD-60"]}'::jsonb
where list_key = 'category' and code = 'thread' and coalesce(config->>'source', '') = 'color';

-- วิธีทำโลโก้ตั้งต้น
insert into public.design_library_choices (list_key, code, name, name_en, config, sort_order, is_active)
select v.list_key, v.code, v.name, v.name_en, v.config, v.sort_order, true
from (values
  ('logo_method', 'emboss',  'Embossed',      'Embossed',          '{"options":[{"code":"deboss","name":"พิมพ์จม","name_en":"Debossed"},{"code":"silver","name":"พิมพ์ฟอยล์เงิน","name_en":"Silver foil"},{"code":"gold","name":"พิมพ์ฟอยล์ทอง","name_en":"Gold foil"},{"code":"black","name":"พิมพ์ดำ","name_en":"Black"},{"code":"raised","name":"พิมพ์นูน","name_en":"Raised"}]}'::jsonb, 10),
  ('logo_method', 'dtf',     'DTF',           'DTF print',         '{"warn":"พิมพ์บนบางวัสดุไม่ได้ — เช็กวัสดุกับโรงพิมพ์ก่อนสั่ง"}'::jsonb, 20),
  ('logo_method', 'uv',      'UV',            'UV print',          '{"warn":"พิมพ์บนบางวัสดุไม่ได้ — เช็กวัสดุกับโรงพิมพ์ก่อนสั่ง"}'::jsonb, 30),
  ('logo_method', 'leather', 'โลโก้หนัง',      'Leather patch',     '{"needs_material":true,"material_tags":["หนัง","PU"],"options":[{"code":"deboss","name":"พิมพ์จม","name_en":"Debossed"},{"code":"silver","name":"พิมพ์ฟอยล์เงิน","name_en":"Silver foil"},{"code":"gold","name":"พิมพ์ฟอยล์ทอง","name_en":"Gold foil"},{"code":"black","name":"พิมพ์ดำ","name_en":"Black"},{"code":"raised","name":"พิมพ์นูน","name_en":"Raised"}]}'::jsonb, 40),
  ('logo_method', 'screen',  'สกรีน',          'Silk screen print', '{}'::jsonb, 50),
  ('logo_method', 'embroid', 'ปัก',            'Embroidered',       '{"options":[{"code":"patch","name":"แพตช์ปัก","name_en":"Embroidered patch"},{"code":"direct","name":"ปักลงไปเลย","name_en":"Direct embroidery"}]}'::jsonb, 60),
  ('logo_method', 'laser',   'มาร์กเลเซอร์',    'Laser engraved',    '{}'::jsonb, 70),
  ('logo_method', 'ribbon',  'ป้ายทอ (Ribbon)', 'Woven label',       '{}'::jsonb, 80)
) as v(list_key, code, name, name_en, config, sort_order)
where not exists (select 1 from public.design_library_choices c where c.list_key = 'logo_method');
