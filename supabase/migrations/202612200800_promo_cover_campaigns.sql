-- 🖼 เปลี่ยนปกโปรทุกร้าน (เจ้าของเลือกจาก widget 2026-11-20: แบบตัวอย่าง + กรอบโปรอัตโนมัติ + TikTok/Lazada ส่งล่วงหน้า + แจ้งเตือนเมื่อล้มเหลว)
-- ชุดโปร 1 ชุด = หลายรุ่น × หลายร้าน · ตั้งเวลาเริ่ม-จบ · จบแล้วย้อนเป็นปกเดิมอัตโนมัติ
-- เป้าหมายรายร้าน (targets) จดชุดรูปเดิมบนร้านไว้ก่อนเปลี่ยน (before_refs) + สำเนาปกเดิมในคลังรูปเรา (backup_key) → ย้อนกลับได้
-- ใช้ผ่าน API หลังบ้านเท่านั้น (/api/promo-covers · service role) — เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated

create table if not exists public.promo_cover_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  -- draft = ร่าง · scheduled = ยืนยันแล้ว รอถึงเวลา · live = ส่งแล้ว (บางร้านอาจยังรอ) · ended = ย้อนครบ/จบ · cancelled = ยกเลิก
  status        text not null default 'draft' check (status in ('draft','scheduled','live','ended','cancelled')),
  starts_at     timestamptz null,           -- null = เริ่มทันทีที่กดยืนยัน
  ends_at       timestamptz null,           -- null = ไม่มีวันจบ (กดย้อนเอง)
  auto_revert   boolean not null default true,
  -- ร้านที่ต้องรอตรวจ (TikTok/Lazada) ส่งล่วงหน้ากี่ชั่วโมง
  early_hours   integer not null default 24 check (early_hours between 0 and 168),
  platforms     text[] not null default '{}',
  -- กรอบโปรอัตโนมัติ: รูป PNG พื้นใส (r2 key) แปะทับปกเดิมของทุกรุ่น
  frame_key     text null,
  note          text null,
  confirmed_at  timestamptz null,
  confirmed_by  uuid null,
  revert_requested_at timestamptz null,     -- กด "ย้อนปกเดิมเดี๋ยวนี้"
  deleted_at    timestamptz null,           -- ถังขยะ (กู้คืนได้)
  created_by    uuid null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists promo_cover_campaigns_status_idx on public.promo_cover_campaigns (status) where deleted_at is null;

create table if not exists public.promo_cover_items (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.promo_cover_campaigns(id) on delete cascade,
  parent_sku_id uuid not null references public.parent_skus_v2(id) on delete cascade,
  -- ปกโปรที่จะส่ง (r2 key) · source = upload | library | frame (ระบบแปะกรอบให้)
  promo_key     text null,
  source        text not null default 'upload' check (source in ('upload','library','frame')),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, parent_sku_id)
);

create table if not exists public.promo_cover_targets (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.promo_cover_campaigns(id) on delete cascade,
  item_id       uuid not null references public.promo_cover_items(id) on delete cascade,
  parent_sku_id uuid not null,
  platform      text not null check (platform in ('shopee','lazada','tiktok','line_shopping','website')),
  -- ร้านตลาด = platform_catalog_listings.id · เว็บเรา = shops.id
  target_key    text not null,
  brand_id      uuid null,
  label         text null,
  -- pending = รอส่ง · applied = ปกโปรขึ้นแล้ว · review = ส่งแล้ว รอร้านตรวจ · failed = ส่งไม่ผ่าน
  -- skipped = ข้าม (บอกเหตุผล) · reverted = ย้อนแล้ว · revert_failed = ย้อนไม่ผ่าน · conflict = มีคนเปลี่ยนปกเองระหว่างโปร ไม่ย้อนทับ
  status        text not null default 'pending' check (status in ('pending','applied','review','failed','skipped','reverted','revert_failed','conflict')),
  before_refs   jsonb null,                 -- ชุดรูปเดิมบนร้าน (ก่อนเปลี่ยน)
  before_cover_url text null,               -- ลิงก์ปกเดิม (ไว้โชว์ก่อน/หลัง)
  backup_key    text null,                  -- สำเนาปกเดิมในคลังรูปเรา (กันรูปบนร้านหาย)
  applied_ref   text null,                  -- รูปที่เราใส่เป็นรูปแรก (รหัส/ลิงก์ของร้าน) — ใช้เช็กก่อนย้อน
  error         text null,
  attempts      integer not null default 0,
  applied_at    timestamptz null,
  reverted_at   timestamptz null,
  notified_at   timestamptz null,           -- แจ้งเตือนเรื่องล้มเหลวแล้ว (กันแจ้งซ้ำ)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (item_id, platform, target_key)
);
create index if not exists promo_cover_targets_campaign_idx on public.promo_cover_targets (campaign_id, status);

alter table public.promo_cover_campaigns enable row level security;
alter table public.promo_cover_items enable row level security;
alter table public.promo_cover_targets enable row level security;
revoke all on public.promo_cover_campaigns from anon, authenticated;
revoke all on public.promo_cover_items from anon, authenticated;
revoke all on public.promo_cover_targets from anon, authenticated;
