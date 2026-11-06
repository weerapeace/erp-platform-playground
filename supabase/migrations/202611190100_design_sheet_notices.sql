-- ใบแจ้งลูกค้า (ใบงานออกแบบ แท็บ "แจ้งลูกค้า") — เจ้าของขอ 2026-11-06 · applied ผ่าน Supabase MCP แล้ว
-- 1 แถว = 1 ใบแจ้ง (แจ้งทั่วไป / ผ้าที่มาทำได้กี่ใบ / ใช้ผ้ากี่หลาต่อใบ) · เก็บรูป+คำอธิบายใต้รูป ตัวเลขผ้า ข้อความ และสิ่งที่เลือกโชว์ตอนส่งออก
-- โค้ด: lib/design-sheet-notice.ts (cleanNotice) · API /api/design-sheets/[id]/notices
create table if not exists public.design_sheet_notices (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.design_sheets(id) on delete cascade,
  kind text not null default 'free' check (kind in ('yield', 'usage', 'free')),
  title text,
  images jsonb not null default '[]'::jsonb,      -- [{url, key, caption}]
  img_cols smallint not null default 2 check (img_cols between 1 and 4),
  calc jsonb not null default '{}'::jsonb,        -- {material, unit, received, mode, waste_pct, rows:[{key,label,use,order}]}
  note text,
  show jsonb not null default '{}'::jsonb,        -- {show:{key:bool}, fmt:{paper, orientation, jpg_size, jpg_quality, company_id}}
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_sheet_notices_sheet_idx on public.design_sheet_notices (sheet_id, created_at desc);
alter table public.design_sheet_notices enable row level security;   -- deny-all: อ่าน/เขียนผ่าน API (service role) เท่านั้น
revoke all on table public.design_sheet_notices from anon;
comment on table public.design_sheet_notices is 'ใบแจ้งลูกค้าของใบงานออกแบบ (แท็บ แจ้งลูกค้า) — API /api/design-sheets/[id]/notices';
