-- จ่ายงานเหมาแบบตาราง (หน้า "จ่ายงานเหมา" บนบอร์ด) — เพิ่มช่องให้ mo_piecework (เพิ่มอย่างเดียว ไม่แตะของเดิม)
--   1 แถว = งานเหมา 1 อย่าง × คน 1 คน ของใบสั่งผลิต 1 ใบ (งานเดียวแบ่งหลายคน = หลายแถว)
--   wo_id         = ใบจ่ายงานที่ช่างถืออยู่ตอนจ่ายงานเหมา (ไม่บังคับ — ใบที่ยังรอจ่ายไม่มี)
--   assignee_id   = คนรับเหมา (employees.id) — assignee_name ยังเก็บไว้ (สรุปค่าแรงเดิมใช้ชื่อ)
--   dispatched_at = วันที่จ่าย (วันที่ไทย)
--   done_qty      = รับคืนแล้วกี่ชิ้น (ว่าง = เท่าจำนวนที่จ่าย) — ค่าเหมาเดือนคิดจากช่องนี้
--   batch_id      = จ่ายพร้อมกันครั้งเดียว (พิมพ์ใบจ่ายงานเหมาชุดเดียวกัน + กันกดบันทึกซ้ำ)
alter table public.mo_piecework add column if not exists wo_id uuid;
alter table public.mo_piecework add column if not exists assignee_id uuid;
alter table public.mo_piecework add column if not exists dispatched_at date;
alter table public.mo_piecework add column if not exists done_qty numeric;
alter table public.mo_piecework add column if not exists batch_id uuid;

create index if not exists mo_piecework_batch_idx on public.mo_piecework (batch_id) where batch_id is not null;
create index if not exists mo_piecework_open_idx on public.mo_piecework (assignee_name) where is_active and status <> 'done';
