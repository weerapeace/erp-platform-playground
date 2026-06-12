-- Report layout defaults
-- เก็บค่าจัดหน้า report กลาง เช่น margin, font size, row height, ช่องลายเซ็น
-- UI ห้าม query ตรง ให้ผ่าน /api/admin/report-layout-defaults เพื่อคุมสิทธิ์และ audit log

insert into erp_permissions (key, label, category, description, is_dangerous, sort_order)
select v.key, v.label, 'Reports', v.descr, false, v.ord
from (values
  ('reports.view', 'ดูรายงานและค่าจัดหน้า', 'ดู template/report layout defaults', 600),
  ('reports.edit', 'แก้ไขค่าเริ่มต้นรายงาน', 'บันทึกค่า default สำหรับการจัดหน้า report', 610)
) as v(key, label, descr, ord)
where not exists (select 1 from erp_permissions p where p.key = v.key);

-- ไม่ grant ให้ทุก role อัตโนมัติ เพราะ reports.edit เป็นสิทธิ์ตั้งค่ากลาง
-- ให้ admin เปิด permission ในหน้า Admin ตาม role ที่ต้องใช้งานจริง

create table if not exists report_layout_defaults (
  entity_type     text primary key,
  layout_settings jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_by_email text,
  constraint report_layout_defaults_entity_type_check
    check (entity_type ~ '^[a-z0-9_:-]+$'),
  constraint report_layout_defaults_layout_object_check
    check (jsonb_typeof(layout_settings) = 'object')
);

create index if not exists report_layout_defaults_updated_at_idx
  on report_layout_defaults (updated_at desc);

alter table report_layout_defaults enable row level security;

-- API ฝั่ง server ใช้ service role หลังผ่าน guardApi เท่านั้น
revoke all on table report_layout_defaults from anon, authenticated;
