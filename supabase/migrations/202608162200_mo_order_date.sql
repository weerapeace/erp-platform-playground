-- วันที่สั่งงานของใบสั่งผลิต (ผู้ใช้ระบุเอง — ค่าเริ่มต้นเป็นวันนี้ตอนเปิดใบ)
-- ต่างจาก created_at ที่เป็นเวลาที่กดบันทึกจริง (ใช้ตอนเปิดใบย้อนหลังให้ตรงกับเอกสาร)
alter table public.manufacturing_orders
  add column if not exists order_date date;

comment on column public.manufacturing_orders.order_date is 'วันที่สั่งงาน (วันที่เปิดใบสั่งผลิต ตามที่ผู้ใช้ระบุ) — ต่างจาก created_at ที่เป็นเวลาบันทึกจริง';

create index if not exists idx_mo_order_date on public.manufacturing_orders (order_date) where order_date is not null;
