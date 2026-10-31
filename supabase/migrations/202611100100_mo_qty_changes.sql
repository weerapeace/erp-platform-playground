-- 📉 ลดจำนวนใบสั่งผลิต (บอร์ดจ่ายงาน · โหมดอัปเดตงาน): รู้ตอนเตรียมของว่าของไม่พอ ทำได้แค่บางส่วน
-- ตารางใหม่ = "ประวัติเปลี่ยนจำนวน" — เดิมแก้ qty แล้วเลขเดิมหายไปเลย ไม่รู้ว่าเคยสั่งเท่าไหร่ / ลดเพราะอะไร / ที่เหลือไปอยู่ใบไหน
-- ไม่แตะตารางเดิม · เขียน/อ่านผ่าน API /api/mo/[id]/reduce-qty + /api/mo/catch-up (supabaseAdmin) เท่านั้น — RLS เปิด ไม่มี policy

create table if not exists public.mo_qty_changes (
  id uuid primary key default gen_random_uuid(),
  mo_id uuid not null,
  mo_no text not null,
  from_qty numeric not null,
  to_qty numeric not null,
  reason text not null,
  mode text not null check (mode in ('split', 'drop')),   -- split = ที่เหลือแยกเป็นใบใหม่ · drop = ไม่ทำแล้ว
  new_mo_id uuid,                                          -- ใบใหม่ที่แยกออกมา (mode split)
  new_mo_no text,
  wo_changes jsonb not null default '[]'::jsonb,           -- ใบจ่ายงานที่ต้องลดยอดค้างตาม [{id, wo_no, from, to, status_from, status_to, labor_from}] ไว้ย้อนกลับ
  source text,                                             -- catch_up | edit | close_short
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid
);

create index if not exists mo_qty_changes_mo on public.mo_qty_changes (mo_no, created_at desc);
create index if not exists mo_qty_changes_new_mo on public.mo_qty_changes (new_mo_no) where new_mo_no is not null;

alter table public.mo_qty_changes enable row level security;
revoke all on public.mo_qty_changes from anon, authenticated;
