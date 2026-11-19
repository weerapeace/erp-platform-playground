-- ระบบแอปพนักงาน (Staff Apps) รอบ 1 — docs/staff-apps.md
-- เจ้าของอนุมัติ 2026-11-19
-- ต่อยอดตารางแอปเดิม (erp_app_groups) ไม่สร้างตารางแอปที่ 2 → หน้าแอปเดี่ยว /app/<key> · ติดตั้ง PWA · QR ใช้ได้ทันที
-- เพิ่มอย่างเดียว ไม่แก้/ลบข้อมูลเดิม · แอปเดิม 20 ตัวได้ค่าเริ่มต้น kind='module' status='published' (เหมือนเดิมทุกอย่าง)

alter table public.erp_app_groups
  add column if not exists kind text not null default 'module',
  add column if not exists label_en text,
  add column if not exists status text not null default 'published',
  add column if not exists draft jsonb,
  add column if not exists audience jsonb,
  add column if not exists published_version integer not null default 0,
  add column if not exists published_at timestamptz,
  add column if not exists deleted_at timestamptz;

do $$ begin
  alter table public.erp_app_groups add constraint erp_app_groups_kind_chk check (kind in ('module','staff'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.erp_app_groups add constraint erp_app_groups_status_chk check (status in ('draft','published'));
exception when duplicate_object then null; end $$;

comment on column public.erp_app_groups.kind is 'module = แอปหลักเดิม · staff = แอปพนักงานที่แอดมินสร้าง (ตัวช่วยสร้างใน /admin/app-manager)';
comment on column public.erp_app_groups.status is 'draft = ยังไม่เผยแพร่ (เห็นเฉพาะแอดมิน) · published = พนักงานเห็นแล้ว';
comment on column public.erp_app_groups.draft is 'ร่างของแอปพนักงาน (ชื่อ/ไอคอน/หัวข้อ/เมนู/คนเห็น) — กดเผยแพร่ถึงเขียนลงเมนูจริง · lib/staff-apps.ts';
comment on column public.erp_app_groups.audience is 'ใครเห็นแอปนี้ (รูปแบบเดียวกับ erp_menu_items.audience — lib/menu-audience) · null = ทุกคน';
comment on column public.erp_app_groups.deleted_at is 'ถังขยะแอป — มีค่า = ลบแล้ว (กู้คืนได้)';

-- ประวัติเวอร์ชันของแอป (1 แถว = เผยแพร่ 1 ครั้ง) → ย้อนกลับได้
create table if not exists public.erp_app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.erp_app_groups(id) on delete cascade,
  version_no integer not null,
  snapshot jsonb not null,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (app_id, version_no)
);
create index if not exists idx_erp_app_versions_app on public.erp_app_versions(app_id, version_no desc);

-- อ่าน/เขียนผ่าน API ฝั่งเซิร์ฟเวอร์ (service role) เท่านั้น
alter table public.erp_app_versions enable row level security;
revoke all on public.erp_app_versions from anon, authenticated;
