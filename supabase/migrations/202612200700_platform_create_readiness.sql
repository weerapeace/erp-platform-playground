-- เช็กข้ามร้าน ข้อ 6 (เจ้าของเลือก 2026-11-20) — เก็บผล "พร้อมลงร้าน" ที่ตรวจล่วงหน้าทุกคืน
--   ทำไมต้องมีตาราง: ตัวตรวจต้องถาม Shopee/TikTok/Lazada สด (2-5 วิ/สินค้า) — ตรวจตอนเปิดหน้าทีละแถวช้า
--   และกรอง "พร้อมลงเลย" ทั้งแบรนด์ไม่ได้ → cron /api/cron/platform-readiness ตรวจตอนกลางคืนแล้วจดไว้ที่นี่
--   ตรวจสดในหน้า (/api/product-platforms/create-readiness) ก็จดทับให้ด้วย · เพิ่มอย่างเดียว ไม่แตะตารางเดิม
--   ข้อมูลนี้คำนวณใหม่ได้เสมอ (ลบทิ้งได้ไม่เสียอะไร) · อ่าน/เขียนผ่าน service role เท่านั้น

create table if not exists public.platform_create_readiness (
  parent_sku_id uuid not null references public.parent_skus_v2(id) on delete cascade,
  platform_code text not null,
  ready boolean not null default false,
  on_shop text,
  missing jsonb not null default '[]'::jsonb,
  error text,
  checked_at timestamptz not null default now(),
  primary key (parent_sku_id, platform_code)
);
create index if not exists idx_platform_create_readiness_checked on public.platform_create_readiness(checked_at);
alter table public.platform_create_readiness enable row level security;
revoke all on public.platform_create_readiness from anon, authenticated;
