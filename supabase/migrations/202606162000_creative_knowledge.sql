-- คลังความรู้ (Knowledge) ของโมดูลงาน Creative — หน้า HTML แก้ไขได้ (ของกลางในโมดูล)
create table if not exists erp_creative_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_html text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_creative_knowledge_active on erp_creative_knowledge (is_active, sort_order);
