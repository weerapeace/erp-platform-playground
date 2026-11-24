-- บัญชีโฆษณาที่ดึงยอดอยู่ + สถานะดึงล่าสุด (หน้าภาพรวมการตลาด แท็บ "โฆษณา" · เจ้าของเลือก 2026-11-24 รอบ 3 ข้อ 1 + 6)
--   Shopee: 1 แถวต่อร้าน (account_id = shop_id) — กุญแจยังอยู่ platform_credentials เดิม · ที่นี่เก็บแค่สถานะ/ข้อผิดพลาดล่าสุด
--   Meta:   1 แถวต่อบัญชีโฆษณา (account_id = act_xxx) — token ผู้ใช้ระยะยาว (สิทธิ์ ads_read) เข้ารหัสไว้ที่ token_enc
--   is_active = false = ไม่ดึงบัญชีนี้ (ปิดได้ เปิดกลับได้ ไม่ลบข้อมูลเก่า)
create table if not exists public.marketing_ads_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  brand_id uuid references public.brands(id) on delete set null,
  account_id text not null,
  account_name text,
  token_enc text,
  token_expires_at timestamptz,
  is_active boolean not null default true,
  last_sync_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  meta jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (platform, account_id)
);
alter table public.marketing_ads_accounts enable row level security;
revoke all on public.marketing_ads_accounts from anon, authenticated;
