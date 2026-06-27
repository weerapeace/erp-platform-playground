-- ระดับ 2: ให้ผู้ใช้เพิ่ม/แก้ "ชนิดไฟล์นำเข้า" เองได้ (เผื่อแพลตฟอร์มเปลี่ยนคอลัมน์ หรือเพิ่มแพลตฟอร์มใหม่)
-- โปรไฟล์มาตรฐาน (Shopee 5 แบบ + generic) ยังอยู่ในโค้ด (lib/platform-import-profiles) เป็นค่าเริ่มต้น
-- ตารางนี้เก็บเฉพาะโปรไฟล์ที่ผู้ใช้สร้าง/ปรับแต่งเอง — ระบบนำเข้าจะรวม (custom จาก DB + built-in จากโค้ด)
-- profile_key ซ้ำกับ built-in id ได้ = override ตัวมาตรฐานนั้น
create table if not exists public.platform_import_profiles (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  profile_key text not null,                          -- ระบุไม่ซ้ำต่อแพลตฟอร์ม เช่น "shopee_custom_promo"
  label text not null,
  kind text not null default 'catalog',               -- catalog | orders
  level text not null default 'product',              -- product | variation
  section text not null default 'import',             -- คีย์เก็บใน raw (กันไฟล์อื่นทับ)
  header_row_index int not null default 0,
  label_row_index int,
  data_start_row_index int not null default 1,
  detect jsonb not null default '{}'::jsonb,           -- {metaRow,metaCol,metaEquals,headerIncludes[]}
  field_map jsonb not null default '{}'::jsonb,        -- {external_product_id:[...],parent_sku:[...],...}
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, profile_key)
);
create index if not exists idx_platform_import_profiles_platform on public.platform_import_profiles(platform_id);
alter table public.platform_import_profiles enable row level security;
drop policy if exists platform_import_profiles_sel on public.platform_import_profiles;
create policy platform_import_profiles_sel on public.platform_import_profiles for select to authenticated using (true);
