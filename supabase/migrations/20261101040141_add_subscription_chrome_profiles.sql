-- ทะเบียนโปรไฟล์ Chrome (ชื่อเล่น → อีเมล/โฟลเดอร์/ลิงก์) ใช้เลือกในฟอร์ม App Subscription
-- รายการ subscription ยังเก็บค่าที่คัดลอกไว้ในแถวเหมือนเดิม (แอปเก่าใช้ต่อได้) · ผูกกันด้วยชื่อเล่น (chrome_profile)
create table if not exists public.subscription_chrome_profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  account_email text not null default '',
  chrome_profile_dir text not null default '',
  chrome_profile_url text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists subscription_chrome_profiles_nickname_key
  on public.subscription_chrome_profiles (lower(nickname));
-- เข้าผ่าน service_role (API ของ ERP) เท่านั้น เหมือนตาราง subscriptions อื่น
alter table public.subscription_chrome_profiles enable row level security;
revoke all on public.subscription_chrome_profiles from anon, authenticated;
