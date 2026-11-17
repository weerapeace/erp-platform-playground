-- อัลบั้ม SAMPLE เชื่อมสินค้า (เจ้าของอนุญาต 2026-11-17 · ใช้แล้วบนฐานข้อมูลจริงชื่อ sample_album_product_links)
-- parent_sku_codes = รหัส Parent SKU (string[]) · sku_codes = รหัส SKU ลูก (string[] · ว่าง = ทั้งรุ่น) — แบบเดียวกับ assets.parent_sku_codes
-- ใช้ที่: หน้า /tasks/samples (ปุ่มเชื่อม SKU / Parent) · ส่วน "รูป SAMPLE" หน้า Parent/SKU · lib/parent-links-registry (sample_albums)
-- ย้อนกลับ: drop index if exists idx_asset_collections_parent_sku_codes, idx_asset_collections_sku_codes;
--           alter table public.asset_collections drop column if exists parent_sku_codes, drop column if exists sku_codes;
alter table public.asset_collections
  add column if not exists parent_sku_codes jsonb not null default '[]'::jsonb,
  add column if not exists sku_codes jsonb not null default '[]'::jsonb;
comment on column public.asset_collections.parent_sku_codes is 'SAMPLE album linked Parent SKU codes (string[])';
comment on column public.asset_collections.sku_codes is 'SAMPLE album linked child SKU codes (string[]; empty = whole model)';
create index if not exists idx_asset_collections_parent_sku_codes on public.asset_collections using gin (parent_sku_codes jsonb_path_ops);
create index if not exists idx_asset_collections_sku_codes on public.asset_collections using gin (sku_codes jsonb_path_ops);
