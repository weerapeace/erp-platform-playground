-- อัลบั้มย่อยในอัลบั้ม + ถังขยะอัลบั้ม + PNG ที่แยกจากไฟล์ออกแบบผูกกับไฟล์ต้นฉบับ (เจ้าของสั่ง 2026-11-27)
-- เพิ่มช่องอย่างเดียว ไม่แก้/ไม่ลบข้อมูลเดิม
--   asset_collections.parent_id  = อัลบั้มแม่ (null = ชั้นบนสุด) · อัลบั้ม SAMPLE ยังใช้ป้ายใน description เหมือนเดิม (API อ่านทั้งสองที่)
--   asset_collections.deleted_at = ลบแบบเก็บไว้ (ถังขยะ) · ลบแม่ = ลูกทั้งต้นได้ deleted_at เดียวกัน → กู้คืนพร้อมกันได้
--   assets.source_asset_id       = ไฟล์ต้นฉบับ (.ai/.pdf/.svg) ที่ PNG ชิ้นนี้ถูกแยกออกมา

alter table public.asset_collections
  add column if not exists parent_id uuid references public.asset_collections(id) on delete set null,
  add column if not exists deleted_at timestamptz;
create index if not exists idx_asset_collections_parent on public.asset_collections(parent_id) where parent_id is not null;

alter table public.assets
  add column if not exists source_asset_id uuid references public.assets(id) on delete set null;
create index if not exists idx_assets_source_asset on public.assets(source_asset_id) where source_asset_id is not null;
