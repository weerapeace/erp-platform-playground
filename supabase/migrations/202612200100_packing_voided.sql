-- ระบบแพ็ค รอบ 3 (เจ้าของเลือก 2026-11-19): ย้อน / แก้ / ยกเลิกการแพ็คได้ — เก็บประวัติ ไม่ลบจริง
-- เพิ่มสถานะ "voided" (ยกเลิกการแพ็ค / เปิดกลับมาแพ็คใหม่) + ใครแก้ล่าสุดเมื่อไหร่ · เพิ่มอย่างเดียว ข้อมูลเดิมไม่เปลี่ยน
alter table public.packing_sessions drop constraint if exists packing_sessions_status_check;
alter table public.packing_sessions add constraint packing_sessions_status_check
  check (status in ('packing','done','problem','abandoned','voided'));
alter table public.packing_sessions add column if not exists edited_at timestamptz;
alter table public.packing_sessions add column if not exists edited_by uuid;
-- คิว "ใครกำลังแพ็คอยู่" อ่านเฉพาะแถวที่ยังแพ็คค้าง
create index if not exists idx_packing_sessions_open on public.packing_sessions(order_id, started_at desc) where status = 'packing';
