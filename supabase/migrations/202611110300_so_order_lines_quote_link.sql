-- ใบสั่งขาย: จำว่าแต่ละบรรทัดดึงมาจาก "ใบเสนอราคา" ใบไหน
--   1 ใบสั่งขายรวมได้หลายใบเสนอราคา (เจ้าของเลือก 2026-11-03) → เก็บต่อบรรทัด แบบเดียวกับ mo_id/mo_no
--   กติกาแปลง/คืนสถานะใบเสนอราคาอยู่ที่ lib/quote-convert.ts
-- ช่องว่างเพิ่มใหม่ (nullable) ไม่แตะข้อมูลเดิม — so_order_lines มี 0 แถว ณ วันที่ทำ
alter table public.so_order_lines
  add column if not exists quote_id uuid references public.erp_playground_quotations(id) on delete set null,
  add column if not exists quote_no text;

create index if not exists so_order_lines_quote_id_idx
  on public.so_order_lines (quote_id) where quote_id is not null;

comment on column public.so_order_lines.quote_id is 'ใบเสนอราคาต้นทางของบรรทัดนี้ (ดึงเข้าใบสั่งขาย) — กติกา lib/quote-convert.ts';
comment on column public.so_order_lines.quote_no is 'เลขใบเสนอราคาต้นทาง (เก็บไว้แสดงผล)';
