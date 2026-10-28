-- 📦 กลุ่มสินค้าของร้าน + 🏷 โปร "ลดรายชิ้น" (2026-10-28) — กฎ lib/website-promotions.ts · lib/website-product-groups.ts
-- ตารางใหม่ ไม่แตะข้อมูลเดิม · เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น → เปิด RLS ไม่ตั้ง policy (แบบเดียวกับ store_promotions)
create table if not exists public.store_product_groups (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  mode text not null default 'manual' check (mode in ('manual', 'smart')),
  codes text[] not null default '{}',
  match jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_product_groups_shop_idx on public.store_product_groups (shop_id);

alter table public.store_product_groups enable row level security;

comment on table public.store_product_groups is 'กลุ่มสินค้าของเว็บร้าน (เลือกเอง / อัตโนมัติตามเงื่อนไข) ใช้ซ้ำได้ทุกโปรโมชัน — แก้ที่ ERP แท็บ 🏷 โปรโมชัน';
comment on column public.store_product_groups.codes is 'manual: รหัสรุ่น (ตัวใหญ่)';
comment on column public.store_product_groups.match is 'smart: {categories, priceMin, priceMax, newDays, codePrefixes} ทุกข้อที่ตั้งต้องตรง';

-- 🏷 ชนิดโปรใหม่ item (ลดรายชิ้น: ลด % / ลดบาท / ราคาพิเศษ ต่อรุ่น)
alter table public.store_promotions drop constraint if exists store_promotions_kind_check;
alter table public.store_promotions add constraint store_promotions_kind_check check (kind in ('flash', 'item', 'qty_percent', 'bxgy', 'tier', 'bundle'));
