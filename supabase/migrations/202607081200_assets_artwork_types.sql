-- เฟส 2: ชนิด Artwork เลือกได้หลายอัน (m2m) — เก็บเป็น jsonb array
-- คง assets.artwork_type (text เดี่ยว) ไว้ = ชนิดแรก (backward-compat + ที่อื่นที่อ่าน field เดิม)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS artwork_types jsonb NOT NULL DEFAULT '[]'::jsonb;

-- backfill: ค่าชนิดเดี่ยวเดิม → array [ค่าเดิม]
UPDATE assets
SET artwork_types = to_jsonb(ARRAY[artwork_type])
WHERE artwork_type IS NOT NULL AND btrim(artwork_type) <> ''
  AND (artwork_types IS NULL OR artwork_types = '[]'::jsonb);

-- index สำหรับ filter "ชนิด" (jsonb containment @>)
CREATE INDEX IF NOT EXISTS idx_assets_artwork_types ON assets USING gin (artwork_types);
