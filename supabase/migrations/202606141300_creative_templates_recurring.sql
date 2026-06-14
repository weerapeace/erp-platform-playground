-- Creative task templates + recurring rules
-- ใช้ชื่อ erp_creative_* กันชนกับ task_templates (ระบบผลิต). สิทธิ์ใช้ tasks.*. RLS server-only.

create table if not exists erp_creative_task_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  task_type        text,
  default_priority text not null default 'normal',
  brand_id         uuid references brands(id),
  description      text,
  platforms        text[] default '{}',
  steps            jsonb not null default '[]',   -- [{title, required_before_next}]
  is_active        boolean not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists erp_creative_recurring (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  template_id  uuid references erp_creative_task_templates(id),
  frequency    text not null default 'weekly',   -- daily/weekly/monthly
  interval_n   int not null default 1,
  weekday      int,
  day_of_month int,
  assignee_id  uuid references employees(id),
  brand_id     uuid references brands(id),
  campaign_id  uuid references erp_creative_campaigns(id),
  start_date   date not null default current_date,
  end_date     date,
  next_run     date,
  last_run     date,
  is_active    boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_creative_recurring_next on erp_creative_recurring (next_run);

alter table erp_creative_task_templates enable row level security;
alter table erp_creative_recurring      enable row level security;

insert into erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
values
('creative-templates', 'erp_creative_task_templates', 'เทมเพลตงาน Creative', 'แม่แบบงาน + ขั้นตอน', 'name', 'physical',
 '{"api_path":"/api/creative-templates","entity_type":"creative_templates"}'::jsonb, true, 64, 'Creative / Marketing'),
('creative-recurring', 'erp_creative_recurring', 'งานประจำ (Recurring)', 'กฎสร้างงานซ้ำตามรอบ', 'name', 'physical',
 '{"api_path":"/api/creative-recurring","entity_type":"creative_recurring"}'::jsonb, true, 65, 'Creative / Marketing')
on conflict (module_key) do nothing;
