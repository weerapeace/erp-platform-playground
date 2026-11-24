-- ยอดโฆษณารายวัน (หน้าภาพรวมการตลาด แท็บ "โฆษณา" · เจ้าของเลือก 2026-11-24 รอบ 3 ข้อ 1 + 6)
-- เติมโดยตัวดึงเบื้องหลัง: /api/cron/marketing-ads (Shopee Ads API · Meta Ads) — อ่านจากแพลตฟอร์มอย่างเดียว
-- level: shop = ยอดรวมทั้งร้าน/บัญชีต่อวัน · campaign = รายแคมเปญต่อวัน
-- ไฟล์ที่อัปโหลดเดิมยังอยู่ marketing_ads_campaign (ไม่ย้าย) — แท็บโฆษณารวมให้เอง
create table if not exists public.marketing_ads_daily (
  id uuid primary key default gen_random_uuid(),
  platform text not null,                      -- shopee | meta
  brand_id uuid references public.brands(id) on delete set null,
  account_id text not null,                    -- shop_id ของ Shopee · ad account id ของ Meta
  level text not null check (level in ('shop', 'campaign')),
  campaign_id text not null default '',        -- '' = ระดับร้าน
  campaign_name text,
  ad_type text,                                -- auto/manual (Shopee) · objective (Meta)
  placement text,                              -- search/discovery/all
  date date not null,                          -- วันตามเวลาไทย
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  orders numeric not null default 0,           -- broad order (ซื้ออะไรก็ได้ในร้านภายใน 7 วันหลังคลิก)
  direct_orders numeric not null default 0,    -- ซื้อสินค้าที่ลงโฆษณาเอง
  items numeric not null default 0,
  sales numeric not null default 0,            -- broad gmv
  direct_sales numeric not null default 0,
  spend numeric not null default 0,
  source text not null default 'api',
  raw jsonb,
  updated_at timestamptz not null default now(),
  unique (platform, account_id, level, campaign_id, date)
);
create index if not exists marketing_ads_daily_date_idx on public.marketing_ads_daily (date);
create index if not exists marketing_ads_daily_brand_idx on public.marketing_ads_daily (brand_id, date);

-- อ่าน/เขียนผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (ตรวจสิทธิ์ marketing.dashboard.view ที่ API)
alter table public.marketing_ads_daily enable row level security;
revoke all on public.marketing_ads_daily from anon, authenticated;
