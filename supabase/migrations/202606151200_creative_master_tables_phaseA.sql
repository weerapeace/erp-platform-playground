-- ============================================================
-- Phase A — ยกระดับ "ประเภทงาน" + "แพลตฟอร์ม" เป็นตารางจริง (โมดูล) + แพลตฟอร์ม m2m
-- เพิ่มอย่างเดียว ไม่แตะ erp_creative_options / erp_creative_tasks.platforms (เก็บเป็น fallback)
-- ============================================================

-- 1) ตารางจริง (ขยาย field ได้: name_en/icon/color รองรับ 2 ภาษา + ใช้ซ้ำโมดูลอื่น)
create table if not exists erp_task_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_th text not null,
  name_en text,
  icon text,
  color text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists erp_platforms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_th text not null,
  name_en text,
  icon text,
  color text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) ย้ายข้อมูลเดิมจาก erp_creative_options (คงตารางเดิมไว้)
insert into erp_task_types (code, name_th, name_en, sort_order, is_active)
select key, label, label, sort_order, is_active from erp_creative_options where kind = 'task_type'
on conflict (code) do nothing;

insert into erp_platforms (code, name_th, name_en, sort_order, is_active)
select key, label, label, sort_order, is_active from erp_creative_options where kind = 'platform'
on conflict (code) do nothing;

-- 3) junction งาน <-> แพลตฟอร์ม (m2m จริง)
create table if not exists erp_creative_task_platforms (
  task_id uuid not null references erp_creative_tasks(id) on delete cascade,
  platform_id uuid not null references erp_platforms(id) on delete cascade,
  primary key (task_id, platform_id)
);
create index if not exists idx_ctp_platform on erp_creative_task_platforms(platform_id);

-- backfill junction จาก tasks.platforms text[] (จับคู่ด้วย code)
insert into erp_creative_task_platforms (task_id, platform_id)
select t.id, p.id
from erp_creative_tasks t
cross join lateral unnest(coalesce(t.platforms, '{}')) as code
join erp_platforms p on p.code = code
on conflict do nothing;

-- 4) ลงทะเบียนโมดูล (โผล่หน้า "โมดูลทั้งหมด" + ได้ CRUD/จัดการ field อัตโนมัติ)
insert into erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select v.module_key, v.table_name, v.label, v.description, 'name_th', 'physical', v.config::jsonb, true, v.sort_order, 'Creative / Marketing'
from (values
  ('task-types', 'erp_task_types', 'ประเภทงาน Creative', 'ชนิดของงาน creative (ถ่ายรูป/แต่งรูป/วิดีโอ ...)', '{"api_path":"/api/master-v2/task-types","entity_type":"task_types"}', 61),
  ('platforms',  'erp_platforms',  'แพลตฟอร์ม',          'ช่องทางลงงาน (Shopee/Lazada/TikTok ...) ใช้ร่วมหลายโมดูล',     '{"api_path":"/api/master-v2/platforms","entity_type":"platforms"}', 62)
) as v(module_key, table_name, label, description, config, sort_order)
where not exists (select 1 from erp_modules m where m.module_key = v.module_key);

-- 5) ลงทะเบียน field ของแต่ละโมดูล (เฉพาะตอนยังไม่มี — กันซ้ำเมื่อรันซ้ำ)
insert into erp_module_fields (module_id, field_key, column_name, field_label, ui_field_type, data_type, is_visible, is_editable, is_searchable, is_sortable, show_in_form, display_order, group_key)
select m.id, f.field_key, f.column_name, f.field_label, f.ui_field_type, f.data_type, f.is_visible, f.is_editable, f.is_searchable, f.is_sortable, f.show_in_form, f.display_order, 'core'
from erp_modules m
cross join (values
  ('code',       'code',       'รหัส (code)',    'text',    'text',    true, true, true,  true,  true, 10),
  ('name_th',    'name_th',    'ชื่อ (ไทย)',     'text',    'text',    true, true, true,  true,  true, 20),
  ('name_en',    'name_en',    'ชื่อ (อังกฤษ)',  'text',    'text',    true, true, true,  false, true, 30),
  ('icon',       'icon',       'ไอคอน',          'text',    'text',    true, true, false, false, true, 40),
  ('color',      'color',      'สี',             'text',    'text',    true, true, false, false, true, 50),
  ('sort_order', 'sort_order', 'ลำดับ',          'number',  'integer', true, true, false, true,  true, 60),
  ('is_active',  'is_active',  'ใช้งาน',         'boolean', 'boolean', true, true, false, true,  true, 70)
) as f(field_key, column_name, field_label, ui_field_type, data_type, is_visible, is_editable, is_searchable, is_sortable, show_in_form, display_order)
where m.module_key in ('task-types', 'platforms')
  and not exists (select 1 from erp_module_fields ef where ef.module_id = m.id);
