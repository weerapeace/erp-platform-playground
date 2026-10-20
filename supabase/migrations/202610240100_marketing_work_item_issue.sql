-- 🛠 โหมดทำงาน (หน้า SKU การตลาด): รุ่นที่ "ติดปัญหา" ระหว่างทำ (เจ้าของขอ 2026-10-20 "อยากให้มีจดหมายเหตุ บางทีงานมีปัญหาระหว่างทำ")
-- ตัวจดหมายเหตุ (ข้อความ ใคร/เมื่อไหร่/@แท็กคน) ใช้ระบบความคิดเห็นกลาง erp_comments
--   entity_type = 'marketing_work_job_item' (รายรุ่น) / 'marketing_work_job' (ทั้งงาน) — ไม่มีตารางใหม่
-- ที่นี่เก็บแค่ธง "ติดปัญหา" ต่อรุ่น ไว้ทำป้าย ⚠️ + ตัวกรอง + นับในหัวงาน
alter table public.marketing_work_job_items
  add column if not exists issue_open boolean not null default false,
  add column if not exists issue_at timestamptz,
  add column if not exists issue_by text;
