-- ใช้ต่อใบจากการวางบนผ้าจริง (เจ้าของขอ 2026-11-17) — ตัวเลขที่ช่างลองวางชิ้นบนผ้าจริง เทียบกับค่าประมาณจากพื้นที่
-- รูปแบบ: { "<parentKey|''>": { "<item_id>": { "qty": 1.05, "unit": "หลา", "note": "...", "by": "ชื่อ", "at": "ISO" } } }
-- ช่องใหม่ว่าง ไม่แตะข้อมูลเดิม · ตัวตรวจค่า: lib/nest-usage.ts (cleanNestUsage)
alter table public.design_sheets add column if not exists nest_usage jsonb;
comment on column public.design_sheets.nest_usage is 'ใช้ต่อใบจากการวางบนผ้าจริง ต่อแท็บตีราคา ต่อวัสดุ (lib/nest-usage.ts)';
