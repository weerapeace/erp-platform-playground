-- วัสดุตีราคาชนิด "ชิ้นสำเร็จ" (ลายพิมพ์/ผ้าชิ้น/ตัวเสริม) — เก็บขนาดตายตัว กว้าง×ยาว (→ พื้นที่ cm²)
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_price_items_piece_dims) 2026-06-11
-- ไม่แตะ material_groups (ใช้ร่วมกับ BOM) — พฤติกรรม "คิดต่อชิ้น" อยู่ฝั่ง design-sheets ล้วน
alter table design_price_items
  add column if not exists width_cm  numeric,
  add column if not exists length_cm numeric;

-- + ลงทะเบียน erp_module_fields (width_cm, length_cm) ให้หน้า master /master/design-price-items แก้ได้
