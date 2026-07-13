-- คู่มือ Flow งาน: งาน (flow) + ขั้นตอน (step) — ระบบพนักงานดูว่าเก็บอะไรไว้ที่ไหน
create table if not exists erp_work_flows (
  id uuid primary key default gen_random_uuid(),
  flow_key text unique not null,
  name text not null,
  icon text,
  description text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists erp_work_flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references erp_work_flows(id) on delete cascade,
  step_no int not null default 1,
  title text not null,
  icon text,
  files_note text,          -- ไฟล์/ข้อมูลที่เกิดในขั้นนี้
  storage_label text,       -- เก็บที่ไหน (ข้อความ)
  storage_kind text default 'module',  -- module | drive | r2 | attach | other
  link_url text,            -- ลิงก์ไปที่เก็บจริง (route ภายใน หรือ URL)
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_wfsteps_flow on erp_work_flow_steps(flow_id, sort_order);

-- เมนู
insert into erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, is_active)
values ('Master Data ⭐', 0, 95, '🗺️', 'คู่มือ Flow งาน', '/master/work-flows', true, true, array['master','tasks','production','dispatch','qc'], true)
on conflict do nothing;
