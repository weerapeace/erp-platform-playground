-- 🏷 โปรโมชันอัตโนมัติของเว็บร้าน (ชุด 3 · 2026-10-22) — กฎ lib/website-promotions.ts
-- ตารางใหม่ ไม่แตะข้อมูลเดิม · เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น → เปิด RLS ไม่ตั้ง policy
create table if not exists public.store_promotions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('flash', 'qty_percent', 'bxgy', 'tier', 'bundle')),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  rule jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_promotions_shop_idx on public.store_promotions (shop_id, active, ends_at);

alter table public.store_promotions enable row level security;

comment on table public.store_promotions is 'โปรโมชันอัตโนมัติเว็บร้าน (Flash sale / ซื้อครบลด / ซื้อ X แถม Y / ขั้นบันได / เซ็ต) — แก้ที่ ERP แท็บ 🏷 โปรโมชัน';
comment on column public.store_promotions.rule is 'ขอบเขต (ทุกสินค้า/รหัสรุ่น/หมวด) + ค่าของชนิดนั้น · ผ่าน sanitizePromotion แล้ว';

-- ออเดอร์: รายการโปรที่ใช้ [{id,name,kind,amount}] — ยอดรวมโปร "รวมอยู่ใน discount แล้ว" (รายงานยอดขาย/แต้มไม่ต้องแก้) · ส่วนของคูปอง = discount - ผลรวม promos
alter table public.store_orders add column if not exists promos jsonb;
comment on column public.store_orders.promos is 'โปรโมชันอัตโนมัติที่ใช้กับออเดอร์นี้ [{id,name,kind,amount}] — รวมอยู่ใน discount แล้ว';
