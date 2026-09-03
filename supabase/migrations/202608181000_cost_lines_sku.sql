-- บรรทัดตีราคาที่เลือกวัตถุดิบ "จาก SKU คลังสินค้า" โดยตรง (ไม่ผ่าน master วัสดุตีราคา)
-- เก็บ id + รหัส SKU ไว้ เพื่อ (1) ดึงราคา/หน้ากว้างมาใหม่ได้ (2) สร้างสูตร BOM ต่อได้โดยมีวัตถุดิบจริงติดไปเลย
alter table public.design_sheet_cost_lines
  add column if not exists item_sku_id uuid references public.skus_v2(id) on delete set null,
  add column if not exists item_sku_code text;
create index if not exists idx_ds_cost_lines_sku on public.design_sheet_cost_lines(item_sku_id) where item_sku_id is not null;
comment on column public.design_sheet_cost_lines.item_sku_id is 'วัตถุดิบจากคลังสินค้า (skus_v2) ที่เลือกในบรรทัดนี้ — null = เลือกจาก master วัสดุตีราคา/พิมพ์เอง';
