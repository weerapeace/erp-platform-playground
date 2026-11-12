-- ดัชนีค้นไฟล์ในคลังรูปตามรหัสรุ่นสินค้า (assets.parent_sku_codes เป็น jsonb array เช่น ["WK46","LMTM11"])
-- ใช้ที่: แท็บภาพรวมของ Parent SKU → "รายการที่เชื่อมกับสินค้านี้" (lib/parent-links-server · parent_sku_codes @> '["<code>"]')
-- เหตุผล: ไม่มีดัชนี = ไล่ทั้งตาราง ~19,500 แถวทุกครั้งที่เปิดสินค้า (วัดจริง 10–26 วิ จนหมดเวลา) · มีดัชนี = ~10ms
-- เจ้าของอนุมัติ 2026-11-12 · ใส่ในฐานข้อมูลจริงแล้ว (apply_migration) · เพิ่มอย่างเดียว ไม่แตะข้อมูล
-- ย้อนกลับ: drop index if exists public.idx_assets_parent_sku_codes;
create index if not exists idx_assets_parent_sku_codes
  on public.assets using gin (parent_sku_codes jsonb_path_ops);
