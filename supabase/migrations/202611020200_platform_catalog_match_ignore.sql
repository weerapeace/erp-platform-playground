-- สินค้าบนร้าน: "ไม่ต้องจับคู่ตัวนี้" (งานบริการ/เลิกขาย/ซ้ำบนร้าน/ชุดโปร)
-- เดิมรู้แค่ จับคู่แล้ว / ยังไม่จับคู่ → ของที่ตั้งใจไม่จับคู่ค้างอยู่กลุ่ม "ยังไม่มีคู่" ตลอด (% จับคู่ไม่มีวันครบ)
-- ใครกดข้ามเก็บใน audit_logs (entity_type = platform_catalog) · การนำเข้าไฟล์/ดึง LINE รอบหน้าไม่แตะ 3 ช่องนี้
-- จับคู่ตัวที่ข้ามไว้ → /api/platform-catalog/match ล้างสถานะข้ามให้เอง
alter table public.platform_catalog_listings
  add column if not exists match_ignored boolean not null default false,
  add column if not exists match_ignore_reason text,
  add column if not exists match_ignored_at timestamptz;

comment on column public.platform_catalog_listings.match_ignored is 'ตั้งใจไม่จับคู่กับสินค้าในระบบ (ไม่นับใน "ยังไม่มีคู่" · ไม่เดาคู่ให้)';
comment on column public.platform_catalog_listings.match_ignore_reason is 'เหตุผลที่ไม่จับคู่ เช่น งานบริการ/รับผลิต · เลิกขายแล้ว';
comment on column public.platform_catalog_listings.match_ignored_at is 'กดไม่ต้องจับคู่เมื่อไหร่';
