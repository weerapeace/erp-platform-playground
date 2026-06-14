-- Creative Task Manager MVP
-- 5 tables (erp_creative_*) + register modules in erp_modules.
-- Reuses existing master data: brands, skus_v2, employees, audit_logs, notifications.
-- RLS enabled (server-only access via API + guardApi). Already applied to project cyivhkecxeoonlowcvaz.

-- 1) Campaign (wraps tasks)
create table if not exists erp_creative_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  brand_id    uuid references brands(id),
  objective   text,
  status      text not null default 'active',     -- active/planning/done/cancelled
  start_date  date,
  end_date    date,
  owner_id    uuid references employees(id),
  note        text,
  is_active   boolean not null default true,       -- soft delete
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) Task (core)
create table if not exists erp_creative_tasks (
  id              uuid primary key default gen_random_uuid(),
  task_no         text unique,                     -- e.g. CT-202606-0001 (generated in API)
  title           text not null,
  description     text,
  task_type       text,                            -- photo/edit/banner/video/listing/social...
  brand_id        uuid references brands(id),
  campaign_id     uuid references erp_creative_campaigns(id),
  sku_id          uuid references skus_v2(id),
  product_name    text,
  priority        text not null default 'normal',  -- urgent/high/normal/low
  status          text not null default 'backlog',
  progress_percent int not null default 0,
  assignee_id     uuid references employees(id),
  reviewer_id     uuid references employees(id),
  approver_id     uuid references employees(id),
  start_date      date,
  due_date        date,
  completed_at    timestamptz,
  approval_status text not null default 'none',     -- none/pending/approved/rejected/revision
  asset_status    text not null default 'missing',  -- missing/draft/final/approved
  platforms       text[] default '{}',
  drive_folder_url text,
  final_asset_url  text,
  published_url    text,
  blocker_status  text default 'none',              -- none/blocked
  blocker_reason  text,
  created_by      uuid,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_creative_tasks_assignee on erp_creative_tasks (assignee_id);
create index if not exists idx_creative_tasks_status   on erp_creative_tasks (status);
create index if not exists idx_creative_tasks_due      on erp_creative_tasks (due_date);
create index if not exists idx_creative_tasks_campaign on erp_creative_tasks (campaign_id);

-- 3) Subtask
create table if not exists erp_creative_subtasks (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references erp_creative_tasks(id) on delete cascade,
  title         text not null,
  assignee_id   uuid references employees(id),
  status        text not null default 'todo',       -- todo/doing/done
  due_date      date,
  required_before_next boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_creative_subtasks_task on erp_creative_subtasks (task_id);

-- 4) Comment + @mention
create table if not exists erp_creative_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references erp_creative_tasks(id) on delete cascade,
  author_id   uuid,
  author_name text,
  body        text not null,
  mentions    jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index if not exists idx_creative_comments_task on erp_creative_comments (task_id);

-- 5) Attachment (R2 file or Drive link)
create table if not exists erp_creative_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references erp_creative_tasks(id) on delete cascade,
  kind         text not null default 'drive_link',  -- file/drive_link/url
  label        text,
  url          text,
  r2_key       text,
  file_name    text,
  content_type text,
  size_bytes   bigint,
  uploaded_by  uuid,
  created_at   timestamptz not null default now()
);
create index if not exists idx_creative_attachments_task on erp_creative_attachments (task_id);

alter table erp_creative_campaigns   enable row level security;
alter table erp_creative_tasks       enable row level security;
alter table erp_creative_subtasks    enable row level security;
alter table erp_creative_comments    enable row level security;
alter table erp_creative_attachments enable row level security;

-- Register modules so they appear in /admin/modules + apps list
insert into erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
values
('creative-tasks', 'erp_creative_tasks', 'งาน Creative (Task Manager)', 'ระบบจัดการงานถ่ายรูป/แต่งรูป/Banner/Video/ลงสินค้า/Social', 'title', 'physical',
 '{"api_path":"/api/master-v2/creative-tasks","entity_type":"creative_tasks"}'::jsonb, true, 60, 'Creative / Marketing'),
('creative-campaigns', 'erp_creative_campaigns', 'แคมเปญ Creative', 'แคมเปญที่ครอบงาน creative', 'name', 'physical',
 '{"api_path":"/api/master-v2/creative-campaigns","entity_type":"creative_campaigns"}'::jsonb, true, 61, 'Creative / Marketing')
on conflict (module_key) do nothing;
