-- 🆕 มาใหม่เป็นชุด (Drop) — ร้านตั้งเวลาปล่อยสินค้าใหม่เป็นชุด ๆ · หน้าเว็บ /new + ป้าย "ใหม่" + Section หน้าแรก
-- 1 แถว = 1 ชุด: ชื่อ/คำโปรย 2 ภาษา · รูปปก (คอม/มือถือ) · สินค้า (รหัสรุ่น เรียงตามที่เลือก) · เวลาเปิด (start_at) · หมดช่วง "ใหม่" (end_at · ว่าง = ไม่หมด)
-- hide_until_start = สินค้าในชุดไม่โผล่ที่ไหนบนเว็บจนถึงเวลาเปิด (API สินค้าสาธารณะกรองออก)
-- จัดการผ่าน /api/website/new-drops (สิทธิ์ products.edit · audit) · เว็บอ่านผ่าน /api/public/storefront/new-drops
-- เปิด RLS ไม่ตั้ง policy (service role เท่านั้น — แบบเดียวกับ store_restock_requests) · ตารางใหม่ ไม่แตะข้อมูลเดิม

create table if not exists public.store_new_drops (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  title_en text check (title_en is null or char_length(title_en) <= 120),
  subtitle text check (subtitle is null or char_length(subtitle) <= 240),
  subtitle_en text check (subtitle_en is null or char_length(subtitle_en) <= 360),
  image_key text check (image_key is null or char_length(image_key) <= 300),
  image_mobile_key text check (image_mobile_key is null or char_length(image_mobile_key) <= 300),
  codes text[] not null default '{}',
  start_at timestamptz not null,
  end_at timestamptz,
  hide_until_start boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);

create index if not exists store_new_drops_shop_idx on public.store_new_drops (shop_id, start_at desc);

alter table public.store_new_drops enable row level security;

comment on table public.store_new_drops is '🆕 ชุดสินค้ามาใหม่ตั้งเวลาปล่อย (Drop) ต่อร้าน — หน้าเว็บ /new · ป้ายใหม่ · ซ่อนสินค้าจนถึงเวลาเปิด';
