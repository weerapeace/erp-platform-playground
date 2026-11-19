-- แอปพนักงาน รอบ 3 — กล่องประกาศจากหัวหน้าบนหน้าแรกแอป (lib/staff-app-extras.ts · docs/staff-apps.md)
-- เจ้าของอนุมัติ 2026-11-19 · เพิ่มอย่างเดียว
--   ลบ = soft delete (deleted_at) กู้คืนได้ · หมดอายุ = expires_at · อ่าน/เขียนผ่าน /api/staff-apps/announcements เท่านั้น

create table if not exists public.erp_app_announcements (
  id uuid primary key default gen_random_uuid(),
  app_key text not null,
  title text not null,
  body text,
  level text not null default 'info' check (level in ('info','warn','urgent')),
  starts_at timestamptz,
  expires_at timestamptz,
  pinned boolean not null default false,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_erp_app_announcements_app on public.erp_app_announcements(app_key, created_at desc);
alter table public.erp_app_announcements enable row level security;
revoke all on public.erp_app_announcements from anon, authenticated;

-- สิทธิ์เขียนประกาศ (แอดมินมีเสมอ · ให้หัวหน้าได้ที่ตารางสิทธิ์)
insert into public.erp_permissions (key, label, category, description, is_dangerous)
values ('staff_apps.announce', 'เขียน/แก้/ลบ ประกาศในแอปพนักงาน', 'แอปพนักงาน', 'โพสต์ประกาศบนหน้าแรกของแอปพนักงาน ตั้งวันหมดอายุได้', false)
on conflict (key) do nothing;
