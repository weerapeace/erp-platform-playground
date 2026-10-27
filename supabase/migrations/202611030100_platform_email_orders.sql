-- 📧 ออเดอร์จากเมลแพลตฟอร์ม (เจ้าของขอ 2026-10-27)
-- Shopee/Lazada ส่งเมลแจ้งออเดอร์เข้า Gmail → สคริปต์ใน Gmail (Apps Script) ส่งต่อเข้า ERP ทุก 15 นาที
-- → ERP อ่านด้วยกฎตายตัว (lib/platform-email) → เก็บลง platform_orders + platform_order_items เดิม (source = 'email')
-- เอกสาร: docs/platform-email-orders.md · หน้าตั้งค่า: /admin/platform-email · รายงาน: /master/platform-sales
--
-- ทุกตารางในนี้อ่าน/เขียนผ่าน API ฝั่ง server (supabaseAdmin) เท่านั้น → เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated
-- (เมลมีชื่อบัญชีผู้ซื้อ · ตารางตั้งค่ามีกุญแจที่สคริปต์ใช้)

-- 1) ตั้งค่า (มีแถวเดียว id = 1)
create table if not exists public.platform_email_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  inbound_key_enc text,
  key_last4 text,
  interval_min int not null default 15 check (interval_min in (5, 10, 15, 30, 60)),
  backfill_days int not null default 60 check (backfill_days between 1 and 365),
  search_query text,
  shops jsonb not null default '[]'::jsonb,
  last_ping_at timestamptz,
  last_received_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
comment on table public.platform_email_settings is 'ตั้งค่าดึงออเดอร์จากเมลแพลตฟอร์ม (แถวเดียว)';
comment on column public.platform_email_settings.inbound_key_enc is 'กุญแจที่สคริปต์ Gmail ใช้ยืนยันตัวกับ ERP (เข้ารหัสด้วย lib/secret-box)';
comment on column public.platform_email_settings.search_query is 'คำค้นใน Gmail ว่าเมลไหนเป็นของแพลตฟอร์ม (ว่าง = ค่าเริ่มต้นในโค้ด)';
comment on column public.platform_email_settings.shops is 'ชื่อร้านในเมล → แบรนด์ [{platform, match, brand_id}] ตัวแรกที่ตรงชนะ';
comment on column public.platform_email_settings.last_ping_at is 'สคริปต์ Gmail ติดต่อเข้ามาล่าสุด (ทดสอบ/ส่งเมล)';

insert into public.platform_email_settings (id, shops) values (1, '[
  {"platform": "shopee", "match": "louismontini_officialshop", "brand_id": "bd337b57-c9d9-4f8a-b45d-e0f6cab3ddc8"},
  {"platform": "lazada", "match": "Louis Montini", "brand_id": "bd337b57-c9d9-4f8a-b45d-e0f6cab3ddc8"}
]'::jsonb) on conflict (id) do nothing;

-- 2) กล่องเมลที่ระบบอ่านแล้ว (1 แถว = 1 เมล) — ใช้เป็นประวัติ "ระบบทำอะไรกับเมลนี้" + อ่านซ้ำได้จาก body_text
create table if not exists public.platform_email_inbox (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  received_at timestamptz,
  from_addr text,
  subject text,
  body_text text,
  platform_code text,
  kind text,
  external_order_id text,
  ref_no text,
  shop_name text,
  parsed jsonb,
  status text not null default 'done' check (status in ('done', 'ignored', 'unreadable', 'attention')),
  note text,
  order_id uuid references public.platform_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_platform_email_inbox_received on public.platform_email_inbox (received_at desc);
create index if not exists idx_platform_email_inbox_status on public.platform_email_inbox (status);
create index if not exists idx_platform_email_inbox_order on public.platform_email_inbox (external_order_id);
comment on table public.platform_email_inbox is 'เมลแพลตฟอร์มที่ ERP อ่านแล้ว + ผลที่ทำ (สร้าง/ยกเลิกออเดอร์ ฯลฯ)';
comment on column public.platform_email_inbox.message_id is 'id เมลใน Gmail — กันอ่านซ้ำ';
comment on column public.platform_email_inbox.body_text is 'เนื้อเมลแปลงเป็นบรรทัดแล้ว (ไว้กด "อ่านใหม่" หลังปรับกฎ)';
comment on column public.platform_email_inbox.kind is 'order_paid | order_new | order_cancelled | return_requested | other';
comment on column public.platform_email_inbox.ref_no is 'เลขอ้างอิงอื่น เช่น เลขคำขอคืนเงิน Shopee (ไม่ใช่เลขออเดอร์)';
comment on column public.platform_email_inbox.status is 'done อ่านแล้ว · ignored ไม่ใช่เมลออเดอร์ · unreadable ดูเหมือนเมลออเดอร์แต่อ่านไม่ออก · attention ต้องมีคนดู';

-- 3) จำคู่ "สินค้าในเมล → SKU" ที่คนยืนยันแล้ว (ยืนยันครั้งเดียว ครั้งหน้าระบบจับเอง)
create table if not exists public.platform_email_sku_rules (
  id uuid primary key default gen_random_uuid(),
  platform_code text not null,
  item_key text not null,
  sku_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (platform_code, item_key)
);
comment on table public.platform_email_sku_rules is 'สินค้าในเมลแพลตฟอร์ม (รหัสท้ายชื่อ/ชื่อ + ตัวเลือก) → skus_v2 ที่คนยืนยันแล้ว';

-- 4) รายงานสินค้าที่ขายได้กรองตามวันที่สั่งซื้อ
create index if not exists idx_platform_orders_ordered_at on public.platform_orders (ordered_at);

-- 5) ปิดการอ่านตรงจาก DB
alter table public.platform_email_settings enable row level security;
alter table public.platform_email_inbox enable row level security;
alter table public.platform_email_sku_rules enable row level security;
revoke all on public.platform_email_settings from anon, authenticated;
revoke all on public.platform_email_inbox from anon, authenticated;
revoke all on public.platform_email_sku_rules from anon, authenticated;
