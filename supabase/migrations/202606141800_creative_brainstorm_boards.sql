-- Brainstorm Whiteboard module: content projects + boards + items + comments + reactions + project-skus
-- ใช้ของเดิม: parent_skus_v2, skus_v2, brands, erp_creative_campaigns, erp_creative_tasks, user_profiles. RLS server-only.

create table if not exists erp_creative_projects (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  name          text not null,
  parent_sku_id uuid references parent_skus_v2(id),
  brand_id      uuid references brands(id),
  campaign_id   uuid references erp_creative_campaigns(id),
  status        text not null default 'brainstorming',
  google_slides_url text,
  drive_folder_url  text,
  pm_id         uuid references user_profiles(id),
  summary       jsonb not null default '{}',
  note          text,
  created_by    uuid,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists erp_creative_boards (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references erp_creative_projects(id) on delete cascade,
  name        text not null default 'Brainstorming',
  status      text not null default 'in_progress',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists erp_creative_board_items (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references erp_creative_boards(id) on delete cascade,
  item_type     text not null,
  title         text, content text, url text, r2_key text, thumbnail_url text,
  sku_id        uuid references skus_v2(id),
  parent_sku_id uuid references parent_skus_v2(id),
  task_id       uuid references erp_creative_tasks(id),
  google_slides_url text,
  x numeric default 0, y numeric default 0, width numeric default 280, height numeric default 160,
  rotation numeric default 0, z_index int default 0,
  color text, tags text[] default '{}', status text not null default 'none', data jsonb not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_creative_board_items_board on erp_creative_board_items (board_id);

create table if not exists erp_creative_board_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references erp_creative_board_items(id) on delete cascade,
  board_id uuid references erp_creative_boards(id) on delete cascade,
  author_id uuid, author_name text, body text not null, mentions jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists idx_creative_board_comments_item on erp_creative_board_comments (item_id);

create table if not exists erp_creative_board_reactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references erp_creative_board_items(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now(),
  unique (item_id, user_id, type)
);

create table if not exists erp_creative_project_skus (
  project_id uuid not null references erp_creative_projects(id) on delete cascade,
  sku_id uuid not null references skus_v2(id) on delete cascade,
  parent_sku_id uuid references parent_skus_v2(id),
  role text not null default 'variation',
  primary key (project_id, sku_id)
);

alter table erp_creative_tasks add column if not exists project_id uuid references erp_creative_projects(id);

alter table erp_creative_projects        enable row level security;
alter table erp_creative_boards          enable row level security;
alter table erp_creative_board_items     enable row level security;
alter table erp_creative_board_comments  enable row level security;
alter table erp_creative_board_reactions enable row level security;
alter table erp_creative_project_skus    enable row level security;

insert into erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
values ('creative-projects','erp_creative_projects','โปรเจกต์คอนเทนต์ (Brainstorm)','กระดานระดมไอเดีย→ส่งผลิต','name','physical',
 '{"api_path":"/api/creative-projects","entity_type":"creative_projects"}'::jsonb, true, 59, 'Creative / Marketing')
on conflict (module_key) do nothing;
