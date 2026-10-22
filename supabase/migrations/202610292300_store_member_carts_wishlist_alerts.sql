-- 🔔 เตือนลืมของในตะกร้า + แจ้งของที่ถูกใจลดราคา (ชุด 5 · 2026-10-22) — lib/webshop-reminders.ts
-- ส่งเฉพาะสมาชิกที่ยินยอมรับข่าวสาร (marketing_opt_in · PDPA) · ร้านเปิดที่ ERP › ข้อมูลร้าน › 🔔

-- ตะกร้าของสมาชิก (เว็บร้านส่งมาเมื่อร้านเปิดเตือนตะกร้า) — 1 คน 1 แถว · สั่งซื้อแล้ว/ตะกร้าว่าง = ลบแถว
create table if not exists public.store_member_carts (
  customer_id uuid primary key references public.store_customers(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  -- [{ code, name, variant, qty, price (บาท), slug }]
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  item_count integer not null default 0,
  -- ภาษาที่ลูกค้าใช้ตอนใส่ตะกร้า (ข้อความเตือนภาษาเดียวกัน)
  lang text not null default 'th' check (lang in ('th', 'en')),
  updated_at timestamptz not null default now(),
  -- เตือนไปแล้วเมื่อไร + ของในตะกร้าตอนเตือน (เปลี่ยนของแล้วเตือนใหม่ได้อีกครั้ง)
  reminded_at timestamptz,
  reminded_hash text
);
create index if not exists store_member_carts_due_idx on public.store_member_carts (shop_id, updated_at);
alter table public.store_member_carts enable row level security;
comment on table public.store_member_carts is 'ตะกร้าล่าสุดของสมาชิกเว็บร้าน (ไว้เตือนลืมของ) — อ่าน/เขียนผ่าน API ERP ด้วย service role เท่านั้น';

-- ราคาอ้างอิงของที่ถูกใจ (ระบบตั้งให้ครั้งแรกที่ตรวจ) + ราคาที่แจ้งไปล่าสุด (แจ้งซ้ำเมื่อลดลงอีก)
alter table public.store_wishlists add column if not exists price_at_add numeric;
alter table public.store_wishlists add column if not exists alerted_price numeric;
comment on column public.store_wishlists.price_at_add is 'ราคาอ้างอิง (บาท) ตอนเริ่มติดตาม — ลดลง ≥ % ที่ร้านตั้ง = แจ้งสมาชิก';
comment on column public.store_wishlists.alerted_price is 'ราคาที่แจ้งไปล่าสุด (กันแจ้งซ้ำราคาเดิม)';
