-- 🎨 Swatch รอบ 10 (เจ้าของเลือก 2026-11-15 · B2 ร้าน · B3 ราคา · B4 สเปก · B6 ราคา/ร้านรายชิ้น)
-- 1) ร้านที่สั่งได้ของแผ่น (หลายร้าน: หลัก + สำรอง) — ราคา/เงื่อนไขซื้อ อยู่กับร้าน
create table public.sku_swatch_suppliers (
  id               uuid primary key default gen_random_uuid(),
  swatch_id        uuid not null references public.sku_swatches(id) on delete cascade,
  partner_id       uuid references public.partners_v2(id) on delete set null,   -- ร้านในทะเบียนคู่ค้า (ว่างได้ = พิมพ์ชื่อเอง)
  partner_name     text,                                                         -- ชื่อร้าน (สำรอง/ตอนไม่มีในทะเบียน)
  buy_url          text,                                                         -- ลิงก์สั่ง 1688 / Taobao / LINE / เว็บ
  price            numeric check (price is null or price >= 0),
  currency         text not null default 'THB' check (currency in ('THB', 'CNY', 'USD')),
  unit             text,                                                         -- หลา / เมตร / ม้วน / กก. / ชิ้น
  moq              numeric check (moq is null or moq >= 0),                      -- ขั้นต่ำ
  lead_days        integer check (lead_days is null or lead_days >= 0),         -- ระยะส่ง (วัน)
  price_updated_at date,
  is_main          boolean not null default false,
  note             text,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index sku_swatch_suppliers_swatch_idx on public.sku_swatch_suppliers (swatch_id, sort_order);
create index sku_swatch_suppliers_partner_idx on public.sku_swatch_suppliers (partner_id);
alter table public.sku_swatch_suppliers enable row level security;   -- อ่าน/เขียนผ่าน API (service role) เหมือนตารางแผงอื่น

-- 2) สเปกวัสดุของแผ่น
alter table public.sku_swatches
  add column if not exists material       text,      -- ชนิด/ส่วนผสม เช่น RPET Canvas
  add column if not exists weight         numeric check (weight is null or weight >= 0),
  add column if not exists weight_unit    text check (weight_unit is null or weight_unit in ('oz', 'gsm')),
  add column if not exists width_cm       numeric check (width_cm is null or width_cm >= 0),
  add column if not exists thickness_mm   numeric check (thickness_mm is null or thickness_mm >= 0),
  add column if not exists supplier_model text;      -- รหัสรุ่นของร้าน เช่น XY018

-- 3) ราคา/ร้านรายชิ้น (ว่าง = ใช้ของแผ่น)
alter table public.sku_swatch_spots
  add column if not exists price        numeric check (price is null or price >= 0),
  add column if not exists supplier_ref uuid references public.sku_swatch_suppliers(id) on delete set null;
