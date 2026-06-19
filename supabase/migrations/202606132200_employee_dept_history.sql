-- ประวัติการย้ายแผนกพนักงาน (จากบอร์ดผังพนักงาน)
create table if not exists public.employee_dept_history (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null,
  from_department_id   uuid,
  from_department_name text,
  to_department_id     uuid,
  to_department_name   text,
  moved_by             uuid,
  moved_by_name        text,
  moved_at             timestamptz not null default now()
);
create index if not exists emp_dept_hist_idx on public.employee_dept_history (employee_id, moved_at desc);
alter table public.employee_dept_history enable row level security;
