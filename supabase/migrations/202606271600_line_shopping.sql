-- ต่อ LINE SHOPPING (ร้านค้า/MyShop) — เฟส 1: เพิ่มแพลตฟอร์ม + ที่เก็บ API Key แบบปลอดภัย
-- LINE SHOPPING มี Public Open API (สินค้า/สต๊อก/ออเดอร์) ยืนยันตัวตนด้วย header X-API-KEY

-- 1) แพลตฟอร์ม LINE SHOPPING
insert into public.erp_platforms (code, name_th, icon_key, is_active, sort_order, capabilities)
select 'line_shopping', 'LINE SHOPPING', '🟢', true,
  coalesce((select max(sort_order) from public.erp_platforms), 0) + 1,
  '{"api": true}'::jsonb
where not exists (select 1 from public.erp_platforms p where p.code = 'line_shopping');

-- 2) ที่เก็บกุญแจ API ต่อ (แบรนด์ × แพลตฟอร์ม) — เก็บฝั่งเซิร์ฟเวอร์เท่านั้น
--    RLS เปิดแต่ "ไม่มี policy" ให้ authenticated = client อ่าน/เขียนไม่ได้เลย (เฉพาะ service role ฝั่ง server)
create table if not exists public.platform_credentials (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  platform_id uuid not null references public.erp_platforms(id) on delete cascade,
  api_key text,
  meta jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (brand_id, platform_id)
);
alter table public.platform_credentials enable row level security;
-- ไม่สร้าง policy โดยตั้งใจ → กุญแจอ่านได้เฉพาะเซิร์ฟเวอร์ (service role bypass RLS)
