-- ร่าง "งานถึงไหนแล้ว" ต่อใบสั่งผลิต (บอร์ดจ่ายงาน · เจ้าของขอ 2026-11-12)
--   เดินดูหน้างานแล้วติ๊กไว้ก่อนว่าใบนี้ไปถึงขั้นไหนจริง (เตรียม/ตัด · จ่าย · รับคืน · QC รับเข้า · ส่งของ) + ตัวเลข
--   ยังไม่บันทึกจริง — ปุ่ม "อัปเดต" (ป๊อปอัปเดตงาน) ดึงไปกรอกให้ แล้วค่อยบันทึกจริงผ่าน API เดิม
--   ทั้งทีมเห็น (1 ใบ = 1 ร่าง · ใครจดใหม่ = แทนชุดเดิม) · ประวัติการจด = audit_logs (mo_update_note.*)
-- ทำไมไม่ใช้ work_catch_up_requests: ตารางนั้นคือคำขอรอหัวหน้ายืนยัน (มีกติกาสถานะ + คิวยืนยันอ่านอยู่) ใส่ร่างปนแล้วคิวจะรก/สับสน
create table if not exists public.mo_update_notes (
  mo_no        text primary key,
  mo_id        uuid,
  steps        jsonb not null default '{}'::jsonb,   -- { prep?:{date}, disp?:{deptId,crewIds,qty}, ret?:{qty,bad}, qc?:{good}, ship?:{qty} }
  note         text,
  updated_by   uuid,
  updated_name text,
  updated_at   timestamptz not null default now(),
  applied_at   timestamptz,                           -- บันทึกจริงแล้ว (กดอัปเดตสำเร็จ) — null = ยังเป็นร่าง
  applied_by   uuid,
  applied_name text
);
create index if not exists mo_update_notes_applied on public.mo_update_notes (applied_at);

-- เข้าถึงผ่าน API (supabaseAdmin + ตรวจสิทธิ์ work_board.*) เท่านั้น
alter table public.mo_update_notes enable row level security;
revoke all on table public.mo_update_notes from anon, authenticated;
