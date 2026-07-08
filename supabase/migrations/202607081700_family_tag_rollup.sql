-- แท็กลำดับชั้น + roll-up: กลุ่มที่มี "แท็กชื่อเดียวกับกลุ่ม" = แท็กพ่อ · แท็กในกลุ่ม = แท็กลูก
-- ติดแท็กลูกให้สินค้า → ติดแท็กพ่อให้อัตโนมัติด้วย (เช่น ซิปไนล่อน #5 → ซิป)
-- apply กับ DB จริงแล้วผ่าน execute_sql (2026-07-08) — ไฟล์นี้ไว้บันทึก/รีเพลย์

-- (โครง: กลุ่ม "ซิป" ใต้ วัตถุดิบ + แท็ก "ซิปไนล่อน #5" อยู่ในกลุ่มซิป + แท็ก "ซิป" ใต้ วัตถุดิบ — ตั้งผ่าน UI/data)

-- roll-up: SKU
CREATE OR REPLACE FUNCTION erp_sku_family_tag_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ptag uuid;
BEGIN
  SELECT p.id INTO ptag
  FROM product_families c
  JOIN product_family_groups g ON g.id = c.group_id
  JOIN product_families p ON p.name = g.name AND p.is_active AND p.id <> c.id
  WHERE c.id = NEW.tgt_id LIMIT 1;
  IF ptag IS NOT NULL THEN
    INSERT INTO skus_v2_product_family_m2m (src_id, tgt_id)
    SELECT NEW.src_id, ptag
    WHERE NOT EXISTS (SELECT 1 FROM skus_v2_product_family_m2m WHERE src_id=NEW.src_id AND tgt_id=ptag);
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_sku_family_tag_rollup ON skus_v2_product_family_m2m;
CREATE TRIGGER trg_sku_family_tag_rollup AFTER INSERT ON skus_v2_product_family_m2m
  FOR EACH ROW EXECUTE FUNCTION erp_sku_family_tag_rollup();

-- roll-up: Parent SKU
CREATE OR REPLACE FUNCTION erp_parent_family_tag_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ptag uuid;
BEGIN
  SELECT p.id INTO ptag
  FROM product_families c
  JOIN product_family_groups g ON g.id = c.group_id
  JOIN product_families p ON p.name = g.name AND p.is_active AND p.id <> c.id
  WHERE c.id = NEW.tgt_id LIMIT 1;
  IF ptag IS NOT NULL THEN
    INSERT INTO parent_skus_v2_product_family_m2m (src_id, tgt_id)
    SELECT NEW.src_id, ptag
    WHERE NOT EXISTS (SELECT 1 FROM parent_skus_v2_product_family_m2m WHERE src_id=NEW.src_id AND tgt_id=ptag);
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_parent_family_tag_rollup ON parent_skus_v2_product_family_m2m;
CREATE TRIGGER trg_parent_family_tag_rollup AFTER INSERT ON parent_skus_v2_product_family_m2m
  FOR EACH ROW EXECUTE FUNCTION erp_parent_family_tag_rollup();

-- backfill: สินค้าที่ติดแท็กลูกอยู่แล้ว → เติมแท็กพ่อ
INSERT INTO skus_v2_product_family_m2m (src_id, tgt_id)
SELECT DISTINCT m.src_id, p.id
FROM skus_v2_product_family_m2m m
JOIN product_families c ON c.id = m.tgt_id
JOIN product_family_groups g ON g.id = c.group_id
JOIN product_families p ON p.name = g.name AND p.is_active AND p.id <> c.id
WHERE NOT EXISTS (SELECT 1 FROM skus_v2_product_family_m2m x WHERE x.src_id=m.src_id AND x.tgt_id=p.id);

INSERT INTO parent_skus_v2_product_family_m2m (src_id, tgt_id)
SELECT DISTINCT m.src_id, p.id
FROM parent_skus_v2_product_family_m2m m
JOIN product_families c ON c.id = m.tgt_id
JOIN product_family_groups g ON g.id = c.group_id
JOIN product_families p ON p.name = g.name AND p.is_active AND p.id <> c.id
WHERE NOT EXISTS (SELECT 1 FROM parent_skus_v2_product_family_m2m x WHERE x.src_id=m.src_id AND x.tgt_id=p.id);
