-- เฟส 2: ค่าเริ่มต้นต่อประเภท (แท็ก product_families) สำหรับ Wizard เพิ่ม SKU
-- default_name = ชื่อ SKU เริ่มต้น · default_uom_id = หน่วยเริ่มต้น (อ้าง uoms.id, ไม่ตั้ง FK เพื่อความยืดหยุ่น)
ALTER TABLE product_families ADD COLUMN IF NOT EXISTS default_name text;
ALTER TABLE product_families ADD COLUMN IF NOT EXISTS default_uom_id uuid;
