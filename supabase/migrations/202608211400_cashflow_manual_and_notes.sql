-- ============================================================
-- กระแสเงินสด — รายการที่กรอกเอง + โน้ตแปะบนกระดาน
-- ------------------------------------------------------------
-- 1) รายการประจำ/รายการเดี่ยวที่ไม่มีเอกสารในระบบ
--    (ค่าเช่า · ค่าน้ำค่าไฟ · ภาษี · ประกันสังคม · ค่าขนส่งเหมา ฯลฯ)
--    ตอนนี้เงินออกพวกนี้ไม่โผล่บนกระดานเลย ทำให้ตัวเลข "เงินออก" ต่ำกว่าความจริง
--
-- 2) โน้ตแปะวัน — กระดานไวท์บอร์ดต้องจดได้ เช่น "รอเช็คเคลียร์" / "คุยกับร้านแล้ว เลื่อนได้"
-- ============================================================

-- ------------------------------------------------------------
-- 1) รายการที่กรอกเอง
-- ------------------------------------------------------------
create table if not exists public.cashflow_manual_items (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,                       -- "ค่าเช่าโรงงาน"
  direction     text not null default 'out',         -- in | out
  amount        numeric not null default 0,
  category      text,                                -- ค่าเช่า | สาธารณูปโภค | ภาษี | ประกันสังคม | อื่น ๆ
  /** once = ครั้งเดียว · monthly = ทุกเดือน */
  repeat_kind   text not null default 'monthly',
  /** monthly: วันที่ของเดือน 1-31 · 0 = สิ้นเดือน */
  day_of_month  integer,
  /** once: วันที่ที่จะเกิด */
  once_date     date,
  /** monthly: เริ่ม/จบเมื่อไหร่ (ว่าง = ไม่จำกัด) */
  start_date    date,
  end_date      date,
  note          text,
  company_id    uuid references public.companies(id),
  is_active     boolean not null default true,
  created_by    text,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cashflow_manual_direction_chk check (direction in ('in', 'out')),
  constraint cashflow_manual_repeat_chk    check (repeat_kind in ('once', 'monthly')),
  constraint cashflow_manual_day_chk       check (day_of_month is null or (day_of_month between 0 and 31)),
  -- ต้องบอกได้ว่าเกิดวันไหน ไม่งั้นวางบนเส้นเวลาไม่ได้
  constraint cashflow_manual_when_chk      check (
    (repeat_kind = 'once'    and once_date is not null) or
    (repeat_kind = 'monthly' and day_of_month is not null)
  )
);

comment on table public.cashflow_manual_items is
  'รายการเงินเข้า-ออกที่ไม่มีเอกสารในระบบ (ค่าเช่า ค่าน้ำไฟ ภาษี ประกันสังคม) — ผู้ใช้กรอกเองที่หน้า /cashflow';
comment on column public.cashflow_manual_items.day_of_month is
  'วันที่ของเดือนสำหรับรายการรายเดือน · 0 = สิ้นเดือน · เดือนที่สั้นกว่าจะเลื่อนมาวันสุดท้ายให้เอง';

create index if not exists idx_cf_manual_active on public.cashflow_manual_items(is_active, repeat_kind);

drop trigger if exists trg_cf_manual_updated_at on public.cashflow_manual_items;
create trigger trg_cf_manual_updated_at
  before update on public.cashflow_manual_items
  for each row execute function public.set_updated_at();

alter table public.cashflow_manual_items enable row level security;
drop policy if exists cf_manual_sel on public.cashflow_manual_items;
create policy cf_manual_sel on public.cashflow_manual_items for select to authenticated using (true);

-- ------------------------------------------------------------
-- 2) โน้ตแปะบนกระดาน
-- ------------------------------------------------------------
create table if not exists public.cashflow_board_notes (
  id         uuid primary key default gen_random_uuid(),
  note_date  date not null,
  body       text not null,
  color      text not null default 'yellow',   -- yellow | blue | pink | green
  is_active  boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashflow_note_color_chk check (color in ('yellow', 'blue', 'pink', 'green'))
);

comment on table public.cashflow_board_notes is
  'โน้ตแปะวันบนกระดานเงินสด (/cashflow/board) — เช่น "รอเช็คเคลียร์" / "คุยกับร้านแล้ว เลื่อนได้"';

create index if not exists idx_cf_notes_date on public.cashflow_board_notes(note_date) where is_active;

drop trigger if exists trg_cf_notes_updated_at on public.cashflow_board_notes;
create trigger trg_cf_notes_updated_at
  before update on public.cashflow_board_notes
  for each row execute function public.set_updated_at();

alter table public.cashflow_board_notes enable row level security;
drop policy if exists cf_notes_sel on public.cashflow_board_notes;
create policy cf_notes_sel on public.cashflow_board_notes for select to authenticated using (true);
