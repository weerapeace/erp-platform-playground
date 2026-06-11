-- เฟส 3 ระบบสิทธิ์: ยกเว้นรายคน (grant/revoke ทับสิทธิ์จากตำแหน่ง)
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (user_permission_overrides) 2026-06-11
-- สิทธิ์จริง = (สิทธิ์ตำแหน่ง ∪ ที่เปิดเพิ่มรายคน) − ที่ปิดรายคน · admin = ได้ทุกอย่างเสมอ (กันล็อกออก)
-- + แก้ erp_can() และ erp_my_permissions() ให้ override รายคนมาก่อน role
-- (เนื้อฟังก์ชันฉบับเต็มดูใน DB — migration นี้สร้างตาราง erp_user_permissions เป็นหลัก)

create table if not exists erp_user_permissions (
  user_id        uuid not null,
  permission_key text not null references erp_permissions(key) on delete cascade,
  mode           text not null check (mode in ('grant','revoke')),
  note           text,
  granted_by     uuid,
  granted_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);
create index if not exists erp_user_permissions_user_idx on erp_user_permissions (user_id);
alter table erp_user_permissions enable row level security;
-- เขียน/อ่านผ่าน API admin (supabaseAdmin) เท่านั้น — ไม่เปิด policy ให้ client ตรง
