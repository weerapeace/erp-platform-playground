-- ฟิลด์สำหรับใบสั่งซื้อร้านจีน (เก็บไว้ครั้งหน้าไม่ต้องกรอกซ้ำ) — ใช้ในหน้าต่างเตรียมใบ PO ร้านจีน
alter table public.skus_v2 add column if not exists supplier_sku_code text;
alter table public.skus_v2 add column if not exists name_cn text;
alter table public.skus_v2 add column if not exists name_en text;
alter table public.skus_v2 add column if not exists purchase_uom_en text;
comment on column public.skus_v2.supplier_sku_code is 'รหัสสินค้าของร้านค้า/ผู้จำหน่าย (ใช้บนใบ PO)';
comment on column public.skus_v2.name_cn is 'ชื่อสินค้าภาษาจีน (ใบ PO ร้านจีน)';
comment on column public.skus_v2.name_en is 'ชื่อสินค้าภาษาอังกฤษ (ใบ PO ร้านจีน)';
comment on column public.skus_v2.purchase_uom_en is 'หน่วยภาษาอังกฤษ (ใบ PO ร้านจีน)';
