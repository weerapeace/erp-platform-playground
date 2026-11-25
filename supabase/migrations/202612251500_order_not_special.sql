-- ออเดอร์ที่คนกด "ไม่ใช่งานพิเศษ" ในหน้า คำสั่งพิเศษ & การ์ด (เจ้าของเลือก 2026-11-25 ข้อ 1)
-- มีแถว = ซ่อนจากรายการงานพิเศษ (ดูคืนได้ที่การ์ดตัวเลข "ไม่ใช่งานพิเศษ") · ลบแถว = กลับเป็นงานพิเศษ (ย้อนกลับ)
-- อ่าน/เขียนผ่าน /api/order-gift-cards เท่านั้น
create table if not exists public.order_not_special (
  platform_order_id uuid primary key references public.platform_orders(id) on delete cascade,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table public.order_not_special enable row level security;
revoke all on public.order_not_special from anon, authenticated;
