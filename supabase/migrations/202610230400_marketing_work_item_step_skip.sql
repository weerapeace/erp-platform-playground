-- 🛠 โหมดทำงาน (หน้า SKU การตลาด): บางรุ่นไม่ต้องทำบางขั้นตอน (เจ้าของขอ 2026-10-18)
-- step_skip = { <step_key>: { at, by } } โครงเดียวกับ step_done · ขั้นที่ "ไม่ต้องทำ" ไม่นับในความคืบหน้า
-- ค่าตั้งต้น {} = ทุกขั้นต้องทำ (ของเดิมไม่เปลี่ยน)
alter table public.marketing_work_job_items
  add column if not exists step_skip jsonb not null default '{}'::jsonb;
