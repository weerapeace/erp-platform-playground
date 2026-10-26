-- 📂 จัดรูปหลายโฟลเดอร์ รอบ 2 — ประวัติชุดอัป + ลายนิ้วมือไฟล์ต้นฉบับ
-- เพิ่มตารางใหม่ 2 ตาราง · ไม่แก้ตาราง/ข้อมูลเดิม
--   erp_image_batches      = 1 แถวต่อการกด "ยืนยัน อัป" 1 ครั้ง (ใคร · เมื่อไร · โหมด · ขนาด · รุ่นที่แตะ · ข้อมูลไว้ย้อน)
--   erp_image_batch_items  = 1 แถวต่อรูปที่อัปสำเร็จ (ลายนิ้วมือไฟล์ · ชื่อไฟล์ · ลงที่ไหน · แถวรูปที่สร้าง)
-- ใช้ที่: components/product-image-router · /api/product-images/catalog (เช็ก "เคยอัปแล้ว") · /api/product-images/batches (ประวัติ + ย้อน)
-- เข้าถึงจาก API ฝั่งเซิร์ฟเวอร์เท่านั้น (service role) — เปิด RLS ไม่มี policy + ถอนสิทธิ์ anon/authenticated

create table if not exists public.erp_image_batches (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  actor_id        uuid,
  actor_name      text,
  mode            text not null default 'append' check (mode in ('append', 'replace')),
  resize          jsonb,
  shop_ids        uuid[] not null default '{}',
  parent_ids      uuid[] not null default '{}',
  ok_count        integer not null default 0,
  failed_count    integer not null default 0,
  -- ข้อมูลที่ต้องใช้ตอน "ย้อนทั้งชุด": ปกเดิม · รูปตัด PNG เดิม · รูปบนเว็บก่อน/หลัง · รูปเดิมที่ถูกแทน (โหมดแทนที่)
  undo_info       jsonb not null default '{}'::jsonb,
  status          text not null default 'done' check (status in ('done', 'undone')),
  undone_at       timestamptz,
  undone_by       uuid,
  undone_by_name  text,
  undo_result     jsonb
);
create index if not exists erp_image_batches_created_idx on public.erp_image_batches (created_at desc);
create index if not exists erp_image_batches_parents_idx on public.erp_image_batches using gin (parent_ids);

create table if not exists public.erp_image_batch_items (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.erp_image_batches (id) on delete cascade,
  created_at     timestamptz not null default now(),
  -- ลายนิ้วมือไฟล์ต้นฉบับ (ขนาด + SHA-256 ของต้น/ท้ายไฟล์ · คำนวณที่เบราว์เซอร์ก่อนย่อ) → ลากไฟล์เดิมมาอีก = รู้ว่าเคยอัปแล้ว
  source_sig     text not null,
  source_name    text,
  source_bytes   bigint,
  parent_id      uuid not null,
  sku_id         uuid,
  dest           text not null check (dest in ('skuMain', 'sku', 'parent', 'desc', 'png', 'webColor', 'heroD', 'heroM')),
  attachment_id  uuid,
  asset_id       uuid,
  r2_key         text
);
create index if not exists erp_image_batch_items_sig_idx on public.erp_image_batch_items (source_sig);
create index if not exists erp_image_batch_items_parent_idx on public.erp_image_batch_items (parent_id, created_at desc);
create index if not exists erp_image_batch_items_batch_idx on public.erp_image_batch_items (batch_id);

alter table public.erp_image_batches enable row level security;
alter table public.erp_image_batch_items enable row level security;
revoke all on table public.erp_image_batches from public, anon, authenticated;
revoke all on table public.erp_image_batch_items from public, anon, authenticated;
grant all on table public.erp_image_batches to service_role;
grant all on table public.erp_image_batch_items to service_role;
