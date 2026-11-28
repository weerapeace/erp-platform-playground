-- 🎬 ศูนย์เรียนรู้ — คลัง Video Shot (ช็อตตัวอย่างจากลิงก์ YouTube/TikTok/Pinterest ตัดช่วงเริ่ม-จบ ไม่ดาวน์โหลดไฟล์)
--   erp_video_shot_lists = ชุดช็อต (Shot list) ตั้งชื่อ เรียงลำดับ ใช้วางแผนถ่ายจริง
--   erp_video_shots      = ช็อต 1 รายการ = ลิงก์ + ช่วงเวลา + ป้าย (ขนาดภาพ / การเคลื่อนกล้อง / แท็ก)
--   ลบ = เก็บไว้ก่อน (is_active=false + deleted_at) · อ่าน/เขียนผ่าน /api/learn/shots (service role) เท่านั้น
--   + ขั้นตอนบทเรียนมีเวลาจบของคลิป (video_end_sec) → บทเรียนโชว์เฉพาะช่วง

create table if not exists public.erp_video_shot_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_video_shots (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.erp_video_shot_lists(id) on delete set null,
  title text not null,
  url text not null,
  platform text not null,
  video_id text,
  start_sec integer,
  end_sec integer,
  shot_size text,
  camera_move text,
  tags text[] not null default '{}',
  note text,
  thumb_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_video_shots_range check (start_sec is null or end_sec is null or end_sec > start_sec)
);

create index if not exists erp_video_shots_list_idx on public.erp_video_shots (list_id, sort_order) where is_active;
create index if not exists erp_video_shots_active_idx on public.erp_video_shots (is_active, created_at desc);

alter table public.erp_video_shot_lists enable row level security;
alter table public.erp_video_shots enable row level security;
revoke all on public.erp_video_shot_lists from anon, authenticated;
revoke all on public.erp_video_shots from anon, authenticated;

alter table public.erp_help_guide_steps add column if not exists video_end_sec integer;

comment on table public.erp_video_shots is 'ศูนย์เรียนรู้ · คลัง Video Shot — ลิงก์คลิป + ช่วงเริ่ม/จบ + ป้ายช็อต (ไม่เก็บไฟล์วิดีโอ)';
comment on table public.erp_video_shot_lists is 'ศูนย์เรียนรู้ · ชุดช็อต (Shot list) สำหรับวางแผนถ่าย';
comment on column public.erp_help_guide_steps.video_end_sec is 'วินาทีที่หยุดคลิปของขั้นนี้ (null = เล่นถึงจบ)';
