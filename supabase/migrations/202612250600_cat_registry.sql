-- 🐾 ทะเบียนแมว (แอป "งานอื่นๆ") รอบ 1 — แมว · คลินิก · วัคซีน · ยาถ่ายพยาธิ/หยดกันเห็บหมัด · น้ำหนัก
--
-- เจ้าของสั่ง 2026-11-24 (ดู widget แล้วเลือกแบบ A · ใช้ร่วมกันในบ้าน · ข้อเสนอ 1-6) · คู่มือ docs/cat-registry.md
-- ใช้ร่วมกันในบ้าน = ทุกคนที่มีสิทธิ์ cats.view เห็นข้อมูลชุดเดียวกัน (ไม่แยกรายคน)
-- ทุกตาราง: ลบ = ลบแบบเก็บไว้ก่อน (is_active=false + deleted_at) กู้คืนได้ที่แท็บ "ถังขยะ" · ลบถาวรได้เฉพาะของในถังขยะ
-- RLS: เปิด ไม่มี policy = เข้าได้เฉพาะ service role ผ่าน API (/api/cats/* — guardApi + audit)
-- กติกาตรวจค่า/คำนวณวันครบกำหนด = lib/cats.ts (ที่เดียว)
-- รอบถัดไป: อาหาร/ทราย/สต็อก (รอบ 2) · หาหมอ/ค่าใช้จ่าย (รอบ 3) · แจ้งเตือน LINE (รอบ 4)

create table if not exists public.cats (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  photo_r2_key  text,
  sex           text check (sex in ('male', 'female')),
  birth_date    date,
  breed         text,
  color         text,
  neutered      boolean not null default false,
  microchip     text,
  note          text,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
comment on table public.cats is 'ทะเบียนแมว: แมว 1 ตัว · lib/cats.ts · หน้า /misc/cats';

create table if not exists public.cat_clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  address     text,
  map_url     text,
  is_24h      boolean not null default false,
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table public.cat_clinics is 'ทะเบียนแมว: คลินิก/โรงพยาบาลสัตว์ (is_24h = ฉุกเฉิน 24 ชม.)';

create table if not exists public.cat_vaccinations (
  id             uuid primary key default gen_random_uuid(),
  cat_id         uuid not null references public.cats(id) on delete cascade,
  vaccine_name   text not null,
  date_given     date not null,
  clinic_id      uuid references public.cat_clinics(id) on delete set null,
  next_due_date  date,
  cost           numeric(12,2) check (cost is null or cost >= 0),
  note           text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists cat_vaccinations_cat_idx on public.cat_vaccinations (cat_id, date_given desc);
comment on table public.cat_vaccinations is 'ทะเบียนแมว: ประวัติฉีดวัคซีน + วันนัดครั้งถัดไป (เข็มล่าสุดของชื่อวัคซีนเดียวกัน = ตัวที่นับครบกำหนด)';

create table if not exists public.cat_treatments (
  id             uuid primary key default gen_random_uuid(),
  cat_id         uuid not null references public.cats(id) on delete cascade,
  type           text not null check (type in ('deworm', 'flea')),
  product        text not null,
  date_given     date not null,
  interval_days  integer check (interval_days is null or interval_days between 1 and 730),
  next_due_date  date,
  cost           numeric(12,2) check (cost is null or cost >= 0),
  note           text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists cat_treatments_cat_idx on public.cat_treatments (cat_id, date_given desc);
comment on table public.cat_treatments is 'ทะเบียนแมว: ยาถ่ายพยาธิ (deworm) / ยาหยดกันเห็บหมัด (flea) + รอบ + วันครบกำหนดครั้งถัดไป';

create table if not exists public.cat_weights (
  id          uuid primary key default gen_random_uuid(),
  cat_id      uuid not null references public.cats(id) on delete cascade,
  date        date not null,
  weight_kg   numeric(5,2) not null check (weight_kg > 0 and weight_kg < 30),
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists cat_weights_cat_idx on public.cat_weights (cat_id, date desc);
comment on table public.cat_weights is 'ทะเบียนแมว: ชั่งน้ำหนัก (กราฟแนวโน้ม)';

alter table public.cats enable row level security;
alter table public.cat_clinics enable row level security;
alter table public.cat_vaccinations enable row level security;
alter table public.cat_treatments enable row level security;
alter table public.cat_weights enable row level security;

-- ─── สิทธิ์ (ให้แอดมินก่อน · คนในบ้านคนอื่นให้รายคนที่ ⚙️ ตั้งค่าแอป → สิทธิ์ตามเมนู) ──
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('cats.view', 'ดูทะเบียนแมว',          'ทะเบียนแมว (Cats)', 'เปิดดูแมว วัคซีน ยา น้ำหนัก คลินิก', false, 2460),
  ('cats.edit', 'เพิ่ม/แก้ทะเบียนแมว',   'ทะเบียนแมว (Cats)', 'เพิ่ม แก้ ลบ (ลบแบบกู้คืนได้) ข้อมูลแมวและประวัติสุขภาพ', false, 2470)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'cats.view'), ('admin', 'cats.edit')
on conflict do nothing;

-- ─── เมนู: แอปงานอื่นๆ ────────────────────────────────────────────────────
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher, app_overrides)
select '/misc/cats', 'i:paw', 'ทะเบียนแมว', 'งานอื่นๆ', array['misc'], 18, 85, 'cats.view', true, true, true, '{}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/misc/cats');
