-- ⏰ ตั้งเวลาเผยแพร่ธีม + 🎪 ธีมแคมเปญ (แท็บดีไซน์ ชุด 5 · 2026-10-22)
--   kind = publish  → ถึงเวลา (starts_at) ระบบเผยแพร่ "ธีมที่เก็บไว้" (theme) + หน้าแรก (layout ถ้าติ๊กไว้) แทนการกดเผยแพร่เอง
--   kind = campaign → ช่วง starts_at–ends_at เว็บใช้หน้าตาแคมเปญ (look = ธีมที่บันทึกไว้ + festive = ของตกแต่ง) ทับธีมปกติ หมดช่วงกลับเอง
-- ตัวทำงาน: ERP site API (/api/public/storefront/site) ตอนเว็บร้านดึงค่า (ทุก ~60 วิ) — ไม่ต้องมี cron · ตรรกะที่ lib/website-theme-schedule(-db).ts
-- เข้าถึงได้เฉพาะ service role (API ERP) — เปิด RLS ไม่มี policy

create table public.store_theme_schedules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('publish', 'campaign')),
  name text not null default '' check (char_length(name) <= 80),
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled', 'failed')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- publish: ธีมทั้งก้อนที่จะเผยแพร่ (ผ่าน mergeTheme แล้ว) · layout = หน้าแรกที่จะเผยแพร่พร้อมกัน (null = ธีมอย่างเดียว)
  theme jsonb,
  layout jsonb,
  -- campaign: { savedThemeId, name, scope, theme } (สำเนาธีมที่บันทึกไว้ ณ ตอนตั้ง — ลบธีมต้นทางแล้วแคมเปญยังใช้ได้) · null = ไม่เปลี่ยนสี
  look jsonb,
  -- campaign: ของตกแต่งช่วงแคมเปญ (theme.page.festive) · null = ตามธีมปกติ
  festive jsonb,
  note text not null default '' check (char_length(note) <= 300),
  version_no integer,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  check (kind <> 'campaign' or (ends_at is not null and ends_at > starts_at)),
  check (kind <> 'publish' or theme is not null)
);

create index store_theme_schedules_due_idx on public.store_theme_schedules (shop_id, status, starts_at);

alter table public.store_theme_schedules enable row level security;
revoke all on table public.store_theme_schedules from anon, authenticated;

comment on table public.store_theme_schedules is 'ตั้งเวลาเผยแพร่ธีม (publish) + ธีมแคมเปญตามช่วงวัน (campaign) ของเว็บร้าน — ERP › เว็บไซต์ › ดีไซน์ › 🎪 แคมเปญ';
