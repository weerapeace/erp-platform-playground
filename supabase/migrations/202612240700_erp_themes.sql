-- ธีมกลาง ERP เฟส 2 — คลังธีม (docs/erp-theme.md)
--   erp_themes          = ธีม 1 แถว: ร่าง (draft_config) / ฉบับเผยแพร่ (published_config) / ถังขยะ (deleted_at)
--   erp_theme_versions  = ทุกครั้งที่กดเผยแพร่ เก็บสำเนาไว้ ย้อนกลับได้
-- อ่าน/เขียนผ่าน API (service role) เท่านั้น → เปิด RLS ไม่มี policy = anon/authenticated แตะตรงไม่ได้
-- สิทธิ์: theme.view / theme.edit / theme.publish / theme.assign (assign ใช้เฟส 3)

create table if not exists public.erp_themes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  preset_key        text,
  draft_config      jsonb not null default '{}'::jsonb,
  published_config  jsonb,
  published_version int  not null default 0,
  published_at      timestamptz,
  published_by_name text,
  deleted_at        timestamptz,
  created_by        uuid,
  created_by_name   text,
  updated_by        uuid,
  updated_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists erp_themes_alive_idx on public.erp_themes (updated_at desc) where deleted_at is null;

create table if not exists public.erp_theme_versions (
  id                uuid primary key default gen_random_uuid(),
  theme_id          uuid not null references public.erp_themes(id) on delete cascade,
  version           int  not null,
  config            jsonb not null,
  note              text,
  published_by      uuid,
  published_by_name text,
  published_at      timestamptz not null default now(),
  unique (theme_id, version)
);

alter table public.erp_themes enable row level security;
alter table public.erp_theme_versions enable row level security;
revoke all on public.erp_themes, public.erp_theme_versions from anon;

insert into public.erp_permissions (key, label, category, description, is_dangerous)
values
  ('theme.view',    'ดูคลังธีม',              'admin', 'เปิดหน้าคลังธีมและดูธีมทั้งหมด', false),
  ('theme.edit',    'สร้าง/แก้ธีม',           'admin', 'สร้างธีม แก้ร่าง ทำสำเนา ย้ายลงถังขยะ/กู้คืน', false),
  ('theme.publish', 'เผยแพร่ธีม',             'admin', 'เผยแพร่ร่างให้ทุกคนเห็น · ลบถาวรจากถังขยะ', false),
  ('theme.assign',  'เลือกธีมให้แต่ละโมดูล',  'admin', 'กำหนดว่าแต่ละแอป/โมดูลใช้ธีมไหน (เฟส 3)', false)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key from (values ('manager','theme.view')) as r(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;
