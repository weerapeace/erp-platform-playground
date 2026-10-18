-- 🛠 โหมดทำงาน (หน้า SKU การตลาด): ผู้รับผิดชอบงานเลือกได้หลายคน (เจ้าของขอ 2026-10-18)
-- เก็บเป็น [{id, name}] — ชื่อเก็บไว้ด้วย (แบบเดียวกับ assignee_name เดิม) → โชว์ได้แม้คนนั้นปิดบัญชีภายหลัง
-- assignee_id / assignee_name เดิมยังอยู่ = คนแรกในรายการ (API เขียนให้ตรงกันเสมอ) ให้ของเก่าอ่านได้
alter table public.marketing_work_jobs
  add column if not exists assignees jsonb not null default '[]'::jsonb;

-- ย้ายผู้รับผิดชอบคนเดียวของงานเดิมเข้ารายการใหม่
update public.marketing_work_jobs
   set assignees = jsonb_build_array(jsonb_build_object('id', assignee_id, 'name', coalesce(assignee_name, '')))
 where assignee_id is not null
   and assignees = '[]'::jsonb;
