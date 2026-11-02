-- ใบสั่งขาย: จำว่าแต่ละรายการอยู่ "ชุด" ไหน (ชุด = กลุ่มใบสั่งงานเดิม mo_groups)
-- ตั้งตั้งแต่ลงออเดอร์ (ยังไม่มีใบสั่งผลิต) → ตอนเปิดใบสั่งผลิต ระบบเอาใบเข้ากลุ่มนี้ให้เอง
-- additive ล้วน: บรรทัดเดิมเป็น null = ยังไม่จัดชุด
alter table public.so_order_lines
  add column if not exists mo_group_id uuid null references public.mo_groups(id) on delete set null;

create index if not exists so_order_lines_mo_group_id_idx on public.so_order_lines (mo_group_id);
