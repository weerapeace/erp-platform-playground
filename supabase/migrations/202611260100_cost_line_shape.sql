-- ✏️ รูปทรงชิ้นวัสดุที่วาดเอง/วางจาก Illustrator ในแท็บตีราคา ใบงานออกแบบ (เจ้าของขอ 2026-11-09)
-- เก็บ { v:1, shape:{ k:"rect"|"ellipse"|"path", ... หน่วย ซม. เริ่มที่ 0,0 }, basis:"box"|"area" }
--   box  = คิดผ้าจากกรอบสี่เหลี่ยม (กว้าง×ยาว ในบรรทัด = กรอบของรูปทรง · สูตรเดิม)
--   area = คิดผ้าจากพื้นที่จริงของรูปทรง
-- ว่าง (null) = บรรทัดแบบเดิม (พิมพ์กว้าง×ยาวเอง) — ไม่กระทบข้อมูลเดิม · ตรวจรูปแบบที่ API (lib/pattern-shape cleanLineShape)
alter table public.design_sheet_cost_lines add column if not exists shape jsonb;
comment on column public.design_sheet_cost_lines.shape is 'รูปทรงชิ้นวัสดุที่วาด (lib/pattern-shape LineShape) · null = กว้าง×ยาวแบบเดิม';
