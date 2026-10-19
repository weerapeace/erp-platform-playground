-- 🧭 ศูนย์ช่วยเหลือของเว็บร้าน (2026-10-19 · เจ้าของเลือกทำ Follow / Legal / Support / ฟอร์มติดต่อ)
--
-- 1) 🚚 เลขพัสดุของออเดอร์เว็บ — เดิมพนักงานพิมพ์ในหมายเหตุ · ตอนนี้แยกช่อง ลูกค้าเห็นเลข + ปุ่มตามพัสดุ (lib/parcel-tracking)
--    เพิ่มคอลัมน์ว่าง 2 ช่อง (ไม่แตะข้อมูลเดิม) · tracking_carrier = รหัสขนส่ง (thaipost / kerry / flash / ... / other)
alter table public.store_orders add column if not exists tracking_no text check (tracking_no is null or char_length(tracking_no) <= 40);
alter table public.store_orders add column if not exists tracking_carrier text check (tracking_carrier is null or char_length(tracking_carrier) <= 20);
comment on column public.store_orders.tracking_no is '🚚 เลขพัสดุ (พนักงานกรอกที่แท็บ ออเดอร์) — ลูกค้าเห็นในหน้า ติดตามคำสั่งซื้อ / บัญชีสมาชิก / อีเมลจัดส่งแล้ว';
comment on column public.store_orders.tracking_carrier is '🚚 รหัสขนส่ง (lib/parcel-tracking PARCEL_CARRIERS)';

-- 2) ✉️ ข้อความจากฟอร์มติดต่อบนเว็บร้าน (Section "ฟอร์มติดต่อ") — ร้านอ่าน/ติ๊กตอบแล้ว/ลบ ที่ ERP แท็บ 🏪 ข้อมูลร้าน › 📨 ข้อความลูกค้า
--    รับจากเว็บผ่าน POST /api/public/storefront/contact (service role · ตรวจค่า lib/website-contact · กันสแปมด้วยจำนวนต่อชั่วโมง)
--    เปิด RLS ไม่ตั้ง policy (แบบเดียวกับ store_subscribers / store_restock_requests) · ตารางใหม่ ไม่แตะข้อมูลเดิม
--    ip_hash = sha256(ร้าน+IP) ตัด 32 ตัว — ใช้นับกันสแปมเท่านั้น ไม่เก็บ IP จริง
create table if not exists public.store_contact_messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null default '' check (char_length(last_name) <= 80),
  email text not null check (char_length(email) between 3 and 160),
  phone text not null default '' check (char_length(phone) <= 30),
  topic text not null default '' check (char_length(topic) <= 80),
  message text not null check (char_length(message) between 1 and 3000),
  lang text not null default 'th' check (lang in ('th', 'en')),
  status text not null default 'new' check (status in ('new', 'done', 'spam')),
  page text check (page is null or char_length(page) <= 200),
  ip_hash text,
  user_agent text,
  staff_note text check (staff_note is null or char_length(staff_note) <= 1000),
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists store_contact_messages_shop_idx on public.store_contact_messages (shop_id, status, created_at desc);
create index if not exists store_contact_messages_email_idx on public.store_contact_messages (shop_id, email, created_at desc);
create index if not exists store_contact_messages_ip_idx on public.store_contact_messages (shop_id, ip_hash, created_at desc);

alter table public.store_contact_messages enable row level security;

comment on table public.store_contact_messages is '✉️ ข้อความจากฟอร์มติดต่อบนเว็บร้าน — ร้านดู/ตอบใน ERP (แท็บข้อมูลร้าน › ข้อความลูกค้า)';

-- 3) 🔔 กฎแจ้งเตือนกระดิ่ง: มีข้อความใหม่ → ผู้จัดการ + แอดมิน (ปิด/แก้ผู้รับได้ที่หน้าตั้งค่าแจ้งเตือน)
insert into public.erp_notification_rules (event_type, name, description, recipients, title_template, body_template, link_pattern, priority, exclude_actor, active, sort_order)
select
  'storefront_contact.created',
  'ข้อความใหม่จากเว็บร้าน → แจ้งผู้จัดการ',
  'ลูกค้าส่งฟอร์มติดต่อบนเว็บร้าน',
  '[{"type":"role","value":"manager"},{"type":"role","value":"admin"}]'::jsonb,
  '📨 ข้อความใหม่จากเว็บ {{shop_name}}',
  '{{name}} · {{topic}} · {{preview}}',
  '/website/{{shop_slug}}?tab=info&sub=messages',
  'normal',
  false,
  true,
  30
where not exists (select 1 from public.erp_notification_rules where event_type = 'storefront_contact.created');
