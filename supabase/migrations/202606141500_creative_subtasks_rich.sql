-- Subtask รวยขึ้น: รายละเอียด + ผู้รับผิดชอบหลายคน (m2m) + ไฟล์แนบระดับ subtask
alter table erp_creative_subtasks add column if not exists description text;

create table if not exists erp_creative_subtask_assignees (
  subtask_id  uuid not null references erp_creative_subtasks(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (subtask_id, employee_id)
);
alter table erp_creative_subtask_assignees enable row level security;

-- ไฟล์แนบ (ของกลางเดิม) ผูกกับ subtask ได้ด้วย (null = ระดับงาน)
alter table erp_creative_attachments add column if not exists subtask_id uuid references erp_creative_subtasks(id) on delete cascade;
create index if not exists idx_creative_attachments_subtask on erp_creative_attachments (subtask_id);
