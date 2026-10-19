-- 🛠 โหมดทำงาน (หน้า SKU การตลาด) ↔ Task Manager (เจ้าของขอ 2026-10-19 "อยากให้เพิ่มงานนี้ที่ Task Manager ได้ด้วย")
-- งานชุดรุ่น 1 งาน ผูกกับงาน Creative 1 ใบ (การ์ดใน Task Manager) — ลบงาน Creative = แค่ตัดลิงก์ (งานชุดรุ่นยังอยู่)
alter table public.marketing_work_jobs
  add column if not exists creative_task_id uuid references public.erp_creative_tasks(id) on delete set null;
create index if not exists idx_marketing_work_jobs_creative_task on public.marketing_work_jobs(creative_task_id) where creative_task_id is not null;
