-- รอบ 2 เฟส 1 (apply กับ DB จริงแล้วผ่าน execute_sql — ไฟล์นี้ไว้บันทึก/รีเพลย์)
-- B1: barcode ว่าง → เติม = code อัตโนมัติ (trigger + backfill ของเดิม)
CREATE OR REPLACE FUNCTION erp_skus_v2_default_barcode()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN NEW.barcode := NEW.code; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_skus_v2_default_barcode ON skus_v2;
CREATE TRIGGER trg_skus_v2_default_barcode BEFORE INSERT OR UPDATE OF barcode, code ON skus_v2
  FOR EACH ROW EXECUTE FUNCTION erp_skus_v2_default_barcode();
UPDATE skus_v2 SET barcode = code WHERE barcode IS NULL OR btrim(barcode) = '';

-- B2: tooltip (help_text) 3 ฟิลด์ SKU (module skus-v2)
UPDATE erp_module_fields SET help_text = 'จัดกลุ่มวัตถุดิบตามชนิด (เช่น ผ้า/หนัง/ซิป) — ใช้กับ BOM และการคิดราคา'
WHERE module_id='4666beb2-0297-4a44-bef3-d436a95a8ee6' AND column_name='material_group_id';
UPDATE erp_module_fields SET help_text = 'กลุ่มสินค้าเชิงบัญชี/คลัง (จาก Odoo) — ใช้จัดหมวดในระบบเดิม'
WHERE module_id='4666beb2-0297-4a44-bef3-d436a95a8ee6' AND column_name='product_group';
UPDATE erp_module_fields SET help_text = 'แท็ก/ประเภทสินค้า (เช่น กระเป๋า/เข็มขัด/วัตถุดิบ) — ใช้จัดกลุ่มในหน้าเลือกดูตามแท็ก + เสนอรหัส SKU'
WHERE module_id='4666beb2-0297-4a44-bef3-d436a95a8ee6' AND field_label='Product Family';
