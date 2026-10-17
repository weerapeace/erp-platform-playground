-- 🔔 "แจ้งฉันเมื่อมีของ" — ลูกค้าฝากช่องทางติดต่อไว้ที่หน้าสินค้าที่ตั้ง "สินค้าหมด" (web_stock_status = 'out')
-- ร้านดูรายชื่อแล้วติดต่อเอง (ไม่ส่งอัตโนมัติ — เจ้าของเลือก 2026-10-17) · ติ๊ก "แจ้งแล้ว" / ยกเลิก / ลบ ได้ใน ERP
-- contact_type: email | phone | line · status: pending (รอ) | notified (แจ้งแล้ว) | cancelled (ยกเลิก)
-- รับจากเว็บผ่าน POST /api/public/storefront/restock (service role · ตรวจค่า) · จัดการผ่าน /api/website/restock
-- เปิด RLS ไม่ตั้ง policy (แบบเดียวกับ store_subscribers) · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.store_restock_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  parent_sku_id uuid not null references public.parent_skus_v2(id) on delete cascade,
  option_label text check (option_label is null or char_length(option_label) <= 120),
  contact_type text not null check (contact_type in ('email', 'phone', 'line')),
  contact text not null check (char_length(contact) between 3 and 160),
  name text check (name is null or char_length(name) <= 80),
  status text not null default 'pending' check (status in ('pending', 'notified', 'cancelled')),
  notified_at timestamptz,
  notified_by text,
  created_at timestamptz not null default now()
);

create index if not exists store_restock_requests_shop_idx on public.store_restock_requests (shop_id, status, created_at desc);
create index if not exists store_restock_requests_parent_idx on public.store_restock_requests (parent_sku_id, status);
-- ฝากซ้ำ (ช่องทางเดิม · สินค้า/สีเดิม) ขณะยังรออยู่ = ไม่เพิ่มแถวใหม่
create unique index if not exists store_restock_requests_dedup_idx
  on public.store_restock_requests (shop_id, parent_sku_id, contact_type, lower(contact), coalesce(option_label, ''))
  where status = 'pending';

alter table public.store_restock_requests enable row level security;

comment on table public.store_restock_requests is '🔔 ลูกค้าฝากให้แจ้งเมื่อสินค้ากลับมามีของ (หน้าสินค้าที่ตั้งสินค้าหมด) — ร้านติดต่อเองจากรายชื่อใน ERP';
