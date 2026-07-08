-- รอบ2 เฟส2: ค่าเริ่มต้นรายตระกูลรหัส (prefix) ต่อแท็ก product_families
-- prefix_defaults = { "<prefix>": {"name":"...","uom_id":"<uuid>"} } — Wizard เลือกตระกูลรหัสแล้วเติมชื่อ/หน่วยตามตระกูล
ALTER TABLE product_families ADD COLUMN IF NOT EXISTS prefix_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;
