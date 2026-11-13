-- คลังแพ็กเกจของแอป (App Subscription) — พิมพ์ชื่อแอปในฟอร์ม → เลือกแพ็กเกจ → ราคา/สกุลเงิน/รอบบิล/โลโก้ เติมให้
-- 1 แถว = 1 แอป (ผูกกับรายการด้วยชื่อ ไม่สนตัวพิมพ์เล็ก-ใหญ่) · แพ็กเกจเก็บเป็น jsonb [{id,name,cost,currency,billing_cycle}]
-- source = manual (คนตั้งเอง) | ai (AI ค้นเว็บ) · source_urls = ลิงก์ที่ AI อ้างอิง · กติกา: lib/subscription-catalog.ts
create table if not exists public.subscription_app_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '',
  site text not null default '',
  logo_url text not null default '',
  plans jsonb not null default '[]'::jsonb,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  source_urls jsonb not null default '[]'::jsonb,
  looked_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists subscription_app_catalog_name_key
  on public.subscription_app_catalog (lower(name));
-- เข้าผ่าน service_role (API ของ ERP) เท่านั้น เหมือนตาราง subscriptions อื่น
alter table public.subscription_app_catalog enable row level security;
revoke all on public.subscription_app_catalog from anon, authenticated;

-- แพ็กเกจที่เลือกในรายการ ('' = ไม่ได้เลือก) — เก็บชื่อไว้ในแถว ลบแพ็กเกจในคลังแล้วรายการยังโชว์ชื่อเดิม
alter table public.subscriptions add column if not exists plan_name text not null default '';
