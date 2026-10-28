-- 👤 ระบบสมาชิกเว็บร้าน: 🧪 สมาชิกทดลอง + ✅ เวลายอมรับนโยบาย (PDPA) + 🔑 รหัสเข้าสู่ระบบ Google/LINE/Facebook ต่อร้าน
-- เพิ่มอย่างเดียว ไม่แก้/ลบข้อมูลเดิม · ดู docs/website-members.md หัวข้อ "สมาชิกทดลอง" และ "ตั้งค่าการเข้าสู่ระบบใน ERP"

-- 🧪 สมาชิกทดลอง: ERP สร้างให้ดูหน้าเว็บในฐานะสมาชิก — ไม่นับสถิติ/CSV · สั่งซื้อจริงไม่ได้ (เช็กในโค้ด) · ลบทิ้งได้เสมอ
alter table public.store_customers add column if not exists is_test boolean not null default false;
create index if not exists store_customers_test_idx on public.store_customers (shop_id) where is_test;

-- ✅ เวลาที่ลูกค้าติ๊กยอมรับนโยบายความเป็นส่วนตัวตอนสมัคร (หลักฐาน PDPA) · บัญชีเก่า = ว่าง
alter table public.store_customers add column if not exists terms_accepted_at timestamptz;

-- 🎫 ตั๋วเข้าเว็บในฐานะสมาชิกทดลอง (ใช้ครั้งเดียว · 10 นาที · เก็บแค่แฮช) — ใช้ตารางตั๋วเดิม
alter table public.store_customer_tokens drop constraint if exists store_customer_tokens_kind_check;
alter table public.store_customer_tokens add constraint store_customer_tokens_kind_check check (kind in ('verify', 'reset', 'trial_login'));

-- 🔑 รหัสของผู้ให้บริการเข้าสู่ระบบ ต่อร้าน (เจ้าของวางในหน้า ERP) · client_secret ห้ามออกนอกเซิร์ฟเวอร์
create table if not exists public.store_login_providers (
  shop_id uuid not null references public.shops(id) on delete cascade,
  provider text not null check (provider in ('google', 'line', 'facebook')),
  client_id text not null default '',
  client_secret text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (shop_id, provider)
);
-- RLS เปิด ไม่มี policy = อ่าน/เขียนได้เฉพาะ service role (API ฝั่งเซิร์ฟเวอร์)
alter table public.store_login_providers enable row level security;
revoke all on public.store_login_providers from anon, authenticated;
