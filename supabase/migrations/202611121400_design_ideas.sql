-- ไอเดียงานออกแบบ (หน้า "ไอเดีย" ใน Design Dashboard · เจ้าของขอ 2026-11-12)
-- จดไว้ก่อน ยังไม่ใช่งานจริง (ไม่มีเลข DS · ไม่โผล่บนบอร์ด/สถิติ/อีเมล/รายงาน) → กด "เริ่มทำงานจริง" = สร้างใบงาน design_sheets ผ่าน POST /api/design-sheets (idea_id)
-- แยกตารางจาก design_sheets โดยตั้งใจ: ใบงานถูกอ่านจากหลายหน้า (รายงาน/อีเมล/ใบสั่งผลิต/ค้นหา) ถ้าเก็บรวมต้องไล่กรองทุกที่ เสี่ยงไอเดียหลุดไปโผล่
-- รูป = R2 key (ImageAttachKeys อัปทันที / รูปจากไลน์) → ตอนเริ่มงานจริง แนบเข้าไฟล์แนบของใบงาน (erp_playground_attachments) ด้วย key เดิม ไม่อัปซ้ำ
-- อ่าน/เขียนผ่าน API ฝั่งเซิร์ฟเวอร์ (service role) เท่านั้น — RLS เปิด ไม่มี policy + revoke
create table if not exists public.design_ideas (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(btrim(name)) between 1 and 200),
  brand_id          uuid null references public.brands(id) on delete set null,
  points            jsonb not null default '[]'::jsonb,   -- รายละเอียดเป็นข้อ ๆ (string[])
  links             jsonb not null default '[]'::jsonb,   -- Reference [{url,label?}] (≤10)
  image_keys        jsonb not null default '[]'::jsonb,   -- R2 key ของรูป (รูปแรก = รูปปก)
  status            text not null default 'open' check (status in ('open', 'paused', 'archived', 'promoting', 'promoted')),
  source            text not null default 'manual' check (source in ('manual', 'line')),
  line_inbox_id     uuid null,                             -- มาจากกล่องรอคัดของไลน์ (design_sheet_line_inbox)
  sender_name       text null,                             -- ชื่อคนส่งในไลน์ (มาจากไลน์)
  created_by        uuid null,
  created_by_name   text null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz null,
  archived_by       text null,
  promoted_sheet_id uuid null references public.design_sheets(id) on delete set null,
  promoted_at       timestamptz null,
  promoted_by       text null
);

create index if not exists design_ideas_status_created_idx on public.design_ideas (status, created_at desc);

alter table public.design_ideas enable row level security;
revoke all on public.design_ideas from anon, authenticated;

comment on table public.design_ideas is 'ไอเดียงานออกแบบ (ยังไม่ใช่ใบงาน) — หน้า ไอเดีย ใน Design Dashboard · เริ่มทำงานจริง = POST /api/design-sheets idea_id';
