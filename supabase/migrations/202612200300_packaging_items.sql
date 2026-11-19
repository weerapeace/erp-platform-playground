-- 🎁 บรรจุภัณฑ์ที่ต้องใส่ตอนแพ็ค (เจ้าของสั่ง 2026-11-19 รอบ 6 — กล่องกระเป๋าสตางค์ / ถุงผ้า / Tags / Care card)
-- packaging_items = รายการบรรจุภัณฑ์กลาง (ชื่อ + รูป + ลำดับ) · ลบ = เก็บเข้าถังก่อน (is_active=false) กู้คืนได้
-- parent_skus_v2.pack_items = รุ่นนี้ต้องใส่บรรจุภัณฑ์อะไรบ้าง (id ใน packaging_items) · แก้ผ่าน /api/packing/packaging + audit
create table if not exists public.packaging_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 80),
  image_r2_key  text,
  sort          integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
alter table public.packaging_items enable row level security;
revoke all on public.packaging_items from anon, authenticated;
comment on table public.packaging_items is 'รายการบรรจุภัณฑ์ที่ใส่ตอนแพ็ค (แก้ผ่าน /api/packing/packaging เท่านั้น)';

alter table public.parent_skus_v2 add column if not exists pack_items uuid[] not null default '{}';
comment on column public.parent_skus_v2.pack_items is 'บรรจุภัณฑ์ที่ต้องใส่ตอนแพ็ค (packaging_items.id) — สถานีแพ็คโชว์ใต้สินค้า';
