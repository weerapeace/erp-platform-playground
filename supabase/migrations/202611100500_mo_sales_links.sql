-- 🧾 ผูกใบสั่งผลิต ↔ ใบขาย (บิลที่ส่งลูกค้าแล้ว) — เจ้าของขอ 2026-10-31: "ตรงนี้เช็คกับของที่ส่งได้ด้วย กดเพื่อ link กับของที่ส่งได้ และเลือกไปถึงขั้นส่งให้เลย"
--   ก่อนหน้านี้ระบบไม่มีที่จำว่าใบสั่งผลิตไหนส่งไปกับใบขายไหน (จับคู่ได้แค่รหัสสินค้า) → ใบค้างบนบอร์ด 132 ใบมีใบขาย SKU เดียวกันหลังวันเปิดใบ · 59 ใบจำนวนตรงเป๊ะแต่ยังขึ้น "รอจ่าย"
--   1 แถว = ใบสั่งผลิต 1 ใบ ได้ของจากบรรทัดใบขาย 1 บรรทัด กี่ชิ้น (ใบสั่งผลิต 1 ใบอาจผูกหลายบรรทัด · บรรทัดใบขาย 1 บรรทัดอาจแบ่งให้หลายใบ)
--   ยกเลิกผูก = is_active false (เก็บประวัติ) · กติกาจับคู่ = lib/mo-sales-match.ts · เข้าผ่าน /api/mo/sales-match (service role) เท่านั้น
create table if not exists public.mo_sales_links (
  id uuid primary key default gen_random_uuid(),
  mo_id uuid not null,
  mo_no text not null,
  sale_id uuid not null,
  sale_line_id uuid not null,
  so_number text,
  sku text,
  qty numeric not null check (qty > 0),
  sale_date date,
  is_active boolean not null default true,
  linked_by uuid,
  linked_by_name text,
  created_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unlinked_by_name text
);
create index if not exists mo_sales_links_mo_idx on public.mo_sales_links (mo_id) where is_active;
create index if not exists mo_sales_links_line_idx on public.mo_sales_links (sale_line_id) where is_active;
create index if not exists mo_sales_links_sku_idx on public.mo_sales_links (sku) where is_active;

alter table public.mo_sales_links enable row level security;
revoke all on public.mo_sales_links from anon, authenticated;
