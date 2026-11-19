-- หมวดในร้าน (แผนจัดหมวดของแต่ละร้าน · เจ้าของเลือกแบบ A แยกต่อร้าน + อนุญาตเพิ่มตาราง 2026-11-19)
-- ร้าน = แบรนด์ × แพลตฟอร์ม (เหมือน platform_accounts) · ระบบจำ "แผน" + "สิ่งที่ติ๊กว่าทำในหลังร้านแล้ว" → เช็กลิสต์ = ส่วนต่าง
-- ใช้ผ่าน API หลังบ้านเท่านั้น (/api/platform-shop-categories · service role) — เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated

create table if not exists public.platform_shop_categories (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references public.brands(id) on delete cascade,
  platform_id         uuid not null references public.erp_platforms(id) on delete cascade,
  name                text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order          integer not null default 0,
  -- หมวดกลางที่ผูกไว้ (ช่วยแนะนำสินค้าเข้าหมวด) · ไม่ผูก = เดาจากชื่อ
  central_category_id uuid null references public.platform_central_categories(id) on delete set null,
  -- สถานะบนร้าน "ตามที่ติ๊กว่าทำแล้ว" (ไม่ใช่ข้อมูลจริงจากร้าน — ร้านส่วนใหญ่ไม่เปิด API หมวดในร้าน)
  on_shop             boolean not null default false,
  shop_name           text null,
  shop_sort           integer null,
  -- ลบ = ย้ายลงถังขยะ (กู้คืนได้) · ลบถาวรได้เมื่อไม่ค้างบนร้านแล้ว
  deleted_at          timestamptz null,
  created_by          uuid null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists platform_shop_categories_shop_idx on public.platform_shop_categories (brand_id, platform_id);

create table if not exists public.platform_shop_category_items (
  category_id   uuid not null references public.platform_shop_categories(id) on delete cascade,
  parent_sku_id uuid not null references public.parent_skus_v2(id) on delete cascade,
  sort_order    integer not null default 0,
  -- in_plan = อยู่ในแผน · on_shop = ติ๊กว่าใส่ในหลังร้านแล้ว · ต่างกัน = เช็กลิสต์ "ใส่/เอาออก"
  in_plan       boolean not null default true,
  on_shop       boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (category_id, parent_sku_id)
);
create index if not exists platform_shop_category_items_parent_idx on public.platform_shop_category_items (parent_sku_id);

alter table public.platform_shop_categories enable row level security;
alter table public.platform_shop_category_items enable row level security;
revoke all on public.platform_shop_categories from anon, authenticated;
revoke all on public.platform_shop_category_items from anon, authenticated;
