-- 📧 ส่งอีเมลรายงาน (ของกลาง) — รอบ 1: ตาราง + สิทธิ์ + เมนู + รายงานตั้งต้น (ปิดอยู่ ยังไม่ส่งจริง)
-- เจ้าของขอ: อีเมลตารางงานที่ค้าง (มีรูป) ส่งทุก จ–ส + หน้าจัดการ · รายงานอื่นเสียบเพิ่มได้ด้วย source_key
-- เขียน/อ่านผ่าน API (supabaseAdmin + guardApi admin.email_reports) เท่านั้น → เปิด RLS ไม่มี policy

create table if not exists public.email_reports (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  source_key     text not null,                                -- แหล่งข้อมูล เช่น design_sheets_pending (lib/email-report/sources)
  filters        jsonb not null default '{}'::jsonb,           -- ตัวกรองของแหล่งนั้น เช่น { brand_group, brand_ids, statuses }
  options        jsonb not null default '{}'::jsonb,           -- { max_rows, stale_days }
  days           smallint[] not null default '{1,2,3,4,5,6}',  -- วันส่ง 1=จันทร์ … 7=อาทิตย์
  send_time      time not null default '08:00',                -- เวลาไทย
  recipients     jsonb not null default '[]'::jsonb,           -- [{type:'user',id,name,email} | {type:'email',email}]
  skip_if_empty  boolean not null default true,                -- ไม่มีงานค้าง = ไม่ต้องส่ง
  is_enabled     boolean not null default false,               -- เปิดส่งตามเวลา
  last_sent_on   date,                                         -- กันส่งซ้ำในวันเดียว (เวลาไทย) — รอบ 2 ใช้
  is_active      boolean not null default true,                -- ลบ = false (เก็บประวัติการส่งไว้)
  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.email_report_runs (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.email_reports(id) on delete cascade,
  ran_at           timestamptz not null default now(),
  trigger          text not null,              -- schedule | test | manual
  status           text not null,              -- sent | partial | failed | skipped_empty | not_configured
  item_count       integer,
  recipient_count  integer,
  sent_count       integer,
  error            text,
  actor_id         uuid,
  actor_name       text,
  detail           jsonb not null default '{}'::jsonb
);
create index if not exists email_report_runs_report_idx on public.email_report_runs (report_id, ran_at desc);

alter table public.email_reports enable row level security;
alter table public.email_report_runs enable row level security;

-- สิทธิ์จัดการ (แอดมินได้อัตโนมัติ · ตำแหน่งอื่นติ๊กเพิ่มที่ Roles & Permissions)
insert into public.erp_permissions (key, label, category, description, is_dangerous)
values ('admin.email_reports', 'จัดการส่งอีเมลรายงาน', 'admin', 'ตั้งรายงานอีเมลอัตโนมัติ: ผู้รับ วัน เวลา ตัวกรอง', true)
on conflict (key) do nothing;

-- เมนู: ตั้งค่า → ส่งอีเมลรายงาน (ต่อจาก Notification Rules)
insert into public.erp_menu_items (label, href, icon, section, section_order, sort_order, permission_key, app_keys, show_in_sidebar, show_in_launcher, is_active)
select 'ส่งอีเมลรายงาน', '/admin/email-reports', '📧', m.section, m.section_order, 175, 'admin.email_reports', array['settings'], true, true, true
from public.erp_menu_items m where m.href = '/admin/notification-rules'
on conflict (href) do nothing;

-- รายงานตั้งต้น (ปิดอยู่ ยังไม่มีผู้รับ) — เจ้าของเปิดหน้าแล้วกดดูตัวอย่างได้ทันที
insert into public.email_reports (name, source_key, filters, options)
select 'งานออกแบบที่ค้าง (ทุกแบรนด์)', 'design_sheets_pending', '{"brand_group":"all"}'::jsonb, '{"max_rows":50,"stale_days":7}'::jsonb
where not exists (select 1 from public.email_reports where source_key = 'design_sheets_pending');
