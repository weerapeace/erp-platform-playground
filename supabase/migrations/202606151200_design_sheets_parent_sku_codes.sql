-- ใบงานออกแบบ 1 ใบ ตั้งได้หลาย Parent SKU (เก็บเป็น array) — additive, ปลอดภัย
-- (applied via MCP apply_migration: design_sheets_parent_sku_codes)
ALTER TABLE public.design_sheets
  ADD COLUMN IF NOT EXISTS parent_sku_codes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ย้ายค่าเดิม (รหัสเดี่ยว parent_sku_code) → รายการ 1 ตัว (เฉพาะแถวที่ยังว่าง)
UPDATE public.design_sheets
SET parent_sku_codes = jsonb_build_array(upper(parent_sku_code))
WHERE parent_sku_code IS NOT NULL AND btrim(parent_sku_code) <> ''
  AND (parent_sku_codes IS NULL OR parent_sku_codes = '[]'::jsonb);
