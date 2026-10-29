-- 🔄 อัปเดตงาน (บอร์ดจ่ายงาน): พนักงานส่ง → หัวหน้ายืนยัน/แก้/ตีกลับ ก่อนบันทึกจริง
-- ตารางใหม่ = "สมุดคำขอ" เก็บสิ่งที่พนักงานกรอกไว้ (ยังไม่แตะข้อมูลใบงาน) · บันทึกจริงตอนหัวหน้ากดยืนยัน (ด้วยสิทธิ์ของหัวหน้า)
-- เขียน/อ่านผ่าน API /api/mo/catch-up/requests (supabaseAdmin) เท่านั้น — RLS เปิด ไม่มี policy

create table if not exists public.work_catch_up_requests (
  id uuid primary key default gen_random_uuid(),
  mo_id uuid not null,
  mo_no text not null,
  product_sku text,
  target text not null,
  draft jsonb not null,                       -- ที่พนักงานกรอก (เป้าหมาย/ติ๊ก/แถวจ่าย/ส่งคืน/QC/วันที่/ปัญหา) + facts ตอนส่ง (ไว้เทียบว่ามีคนแก้ใบหลังส่งไหม)
  summary jsonb not null default '[]'::jsonb,  -- รายการขั้นที่จะบันทึก (ข้อความ) ไว้โชว์ในคิว
  status text not null default 'pending' check (status in ('pending', 'processing', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null,
  requested_name text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_name text,
  reviewed_at timestamptz,
  review_note text,
  result jsonb,                               -- ผลบันทึกทีละขั้นตอนหัวหน้ายืนยัน
  updated_at timestamptz not null default now()
);

-- 1 ใบงาน มีคำขอที่ยังไม่จบได้ทีละ 1 (กันส่งซ้อน/ยืนยันซ้ำ)
create unique index if not exists work_catch_up_requests_open_mo
  on public.work_catch_up_requests (mo_id) where status in ('pending', 'processing');
create index if not exists work_catch_up_requests_status_at
  on public.work_catch_up_requests (status, requested_at desc);
create index if not exists work_catch_up_requests_requester
  on public.work_catch_up_requests (requested_by, requested_at desc);

alter table public.work_catch_up_requests enable row level security;
revoke all on public.work_catch_up_requests from anon, authenticated;

-- สิทธิ์ใหม่ 3 ตัว (หมวดผลิต · ตั้งตามตำแหน่งที่ /admin/roles-permissions + รายคนที่หน้าผู้ใช้)
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('work_board.catch_up',         'อัปเดตงาน: ใช้โหมดอัปเดตงาน (ส่งให้หัวหน้ายืนยัน)', 'production', 'เห็นปุ่ม "อัปเดตงาน" ในเมนู ⋯ ของบอร์ดจ่ายงาน — คนที่จ่ายงานได้ใช้ได้อยู่แล้ว', false, 30),
  ('work_board.catch_up_direct',  'อัปเดตงาน: บันทึกได้เลย ไม่ต้องรอยืนยัน',          'production', 'ไม่มีสิทธิ์นี้ = ทุกการอัปเดตงานไปรอหัวหน้ายืนยันก่อน', false, 31),
  ('work_board.catch_up_approve', 'อัปเดตงาน: ยืนยัน / แก้ / ตีกลับ คำขอของคนอื่น',  'production', 'เห็นคิว "รอยืนยันอัปเดตงาน" + ได้แจ้งเตือนเมื่อมีคำขอใหม่', false, 32)
on conflict (key) do nothing;

-- ค่าเริ่ม: แอดมิน + ผู้จัดการ = บันทึกได้เลยและยืนยันได้ (เหมือนเดิม) · พนักงานที่จ่ายงานได้ = ต้องรอยืนยัน
insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key
from (values
  ('admin', 'work_board.catch_up'), ('admin', 'work_board.catch_up_direct'), ('admin', 'work_board.catch_up_approve'),
  ('manager', 'work_board.catch_up'), ('manager', 'work_board.catch_up_direct'), ('manager', 'work_board.catch_up_approve')
) as r(role_key, permission_key)
where exists (select 1 from public.erp_roles x where x.key = r.role_key)
on conflict do nothing;
