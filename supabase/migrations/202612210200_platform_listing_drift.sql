-- ร้านที่ลงขายแล้ว ตรงกับระบบไหม (รูป/รายละเอียด/ชื่อตัวเลือก/ราคา) — ผลตรวจล่าสุดต่อรายการบนร้าน
-- เขียนโดย lib/platform-listing-drift-server (เปิดดู/กดตรวจ/ตัวตั้งเวลา) · อ่านโดยแท็บแพลตฟอร์ม + เช็กข้ามร้าน
-- เป็นแค่ "ผลตรวจที่จำไว้" ลบทิ้งได้ทุกเมื่อ (ตรวจใหม่ได้) · เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น
create table if not exists public.platform_listing_drift (
  listing_id uuid primary key references public.platform_catalog_listings(id) on delete cascade,
  parent_sku_id uuid references public.parent_skus_v2(id) on delete cascade,
  platform_code text not null,
  issues text[] not null default '{}',
  items jsonb,
  error text,
  checked_at timestamptz not null default now()
);
create index if not exists platform_listing_drift_parent_idx on public.platform_listing_drift (parent_sku_id);
create index if not exists platform_listing_drift_checked_idx on public.platform_listing_drift (checked_at);
alter table public.platform_listing_drift enable row level security;
revoke all on public.platform_listing_drift from anon, authenticated;
