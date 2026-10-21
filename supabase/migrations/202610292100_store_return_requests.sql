-- ↩️ ขอคืน/เปลี่ยนสินค้า (ชุด 4 · 2026-10-22) — ลูกค้าส่งคำขอจากหน้าตามออเดอร์ · ร้านตอบที่ ERP › ↩️ คืน/เปลี่ยน
-- กฎ: lib/website-returns.ts · บันทึก/ตอบ: lib/website-returns-server.ts · ระบบไม่คืนเงิน/ไม่ตัดสต็อกเอง
create table if not exists public.store_return_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  kind text not null check (kind in ('return', 'exchange')),
  reason text not null,
  detail text not null default '',
  -- [{ itemId, name, variant, qty }] — ชื่อ/ตัวเลือกคัดลอกจากรายการในออเดอร์ตอนขอ
  items jsonb not null default '[]'::jsonb,
  images text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'received', 'closed', 'rejected')),
  staff_note text,
  decided_by_name text,
  decided_at timestamptz,
  lang text not null default 'th',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_return_requests_shop_idx on public.store_return_requests (shop_id, status, created_at desc);
create index if not exists store_return_requests_order_idx on public.store_return_requests (order_id);
alter table public.store_return_requests enable row level security;
comment on table public.store_return_requests is 'คำขอคืน/เปลี่ยนสินค้าจากลูกค้าเว็บร้าน (อ่าน/เขียนผ่าน API ERP ด้วย service role เท่านั้น)';

-- วันที่ออเดอร์เป็น "สำเร็จ" (ได้รับของ) — นับวันขอคืน/เปลี่ยน · ตั้งให้ตอนเปลี่ยนสถานะที่ ERP
alter table public.store_orders add column if not exists completed_at timestamptz;
comment on column public.store_orders.completed_at is 'เวลาที่ออเดอร์เปลี่ยนเป็นสำเร็จ (ใช้นับวันขอคืน/เปลี่ยนสินค้า)';
