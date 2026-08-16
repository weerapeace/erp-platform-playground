-- "กำหนดส่งงานภายใน" ของใบสั่งผลิต
--
-- เดิมมีแค่ due_date = วันนัดส่งลูกค้า ส่วนวันที่ต้องส่งงานภายใน (ช่าง/โต๊ะต้องทำเสร็จ)
-- เก็บอยู่ที่ใบจ่ายงานเท่านั้น (mo_work_orders.due_date) → ใบที่ยังไม่จ่ายงานเลยจะตั้งวันไม่ได้
--
-- คอลัมน์นี้ให้ตั้งวันภายในไว้ตั้งแต่ยังไม่จ่ายงาน แล้ว:
--   · ใบจ่ายงานที่จ่ายทีหลังจะได้วันนี้เป็นค่าเริ่มต้น
--   · ตั้งจากป๊อปเช็กลิสต์ = ไล่อัปเดตใบจ่ายงานที่ยังไม่เสร็จของใบนั้นให้ด้วย
alter table public.manufacturing_orders
  add column if not exists internal_due_date date;

comment on column public.manufacturing_orders.internal_due_date is
  'วันกำหนดส่งงานภายใน (ช่าง/โต๊ะต้องทำเสร็จ) — ต่างจาก due_date ที่เป็นวันนัดส่งลูกค้า';

create index if not exists idx_mo_internal_due_date
  on public.manufacturing_orders (internal_due_date)
  where internal_due_date is not null;
