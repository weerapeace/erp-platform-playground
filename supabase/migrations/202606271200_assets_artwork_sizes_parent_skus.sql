-- Artwork (คลังไฟล์กลาง): เพิ่มที่เก็บ "หลายไซส์" + "Parent SKU ที่ใช้"
-- sizes            = [{label,w,h,unit}]  (unit: cm|mm|in|px) — กว้าง×ยาว + ชื่อกำกับ + หน่วยต่อไซส์
-- parent_sku_codes = string[]            — รหัส Parent SKU ที่ใช้ artwork นี้ (แบบเดียวกับ design_sheets.parent_sku_codes)
-- additive ล้วน (ของเดิมไม่กระทบ)
alter table assets
  add column if not exists sizes jsonb not null default '[]'::jsonb,
  add column if not exists parent_sku_codes jsonb not null default '[]'::jsonb;

comment on column assets.sizes is 'Artwork sizes: [{label,w,h,unit}] (unit: cm|mm|in|px)';
comment on column assets.parent_sku_codes is 'Parent SKU codes that use this artwork (string[])';
