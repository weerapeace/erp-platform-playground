-- Design Sheets เฟส 3 — comment ลูกค้า + รอบเสนอราคา + template พิมพ์ 2 ใบ
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (design_sheets_phase3) 2026-06-10
-- (template HTML ฉบับเต็มดูใน erp_report_templates entity_type='design_sheet' / 'design_sheet_quote')

create table if not exists design_sheet_comments (
  id           uuid primary key default gen_random_uuid(),
  sheet_id     uuid not null references design_sheets(id) on delete cascade,
  comment_date date not null default (now()::date),
  body         text not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists design_sheet_comments_sheet_idx on design_sheet_comments (sheet_id);
alter table design_sheet_comments enable row level security;
drop policy if exists design_sheet_comments_select on design_sheet_comments;
create policy design_sheet_comments_select on design_sheet_comments for select using (true);

create table if not exists design_sheet_quotes (
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references design_sheets(id) on delete cascade,
  round      int not null,
  quote_date date,
  price      numeric,
  status     text not null default 'pending',   -- pending / passed / failed
  note       text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_sheet_quotes_sheet_idx on design_sheet_quotes (sheet_id);
alter table design_sheet_quotes enable row level security;
drop policy if exists design_sheet_quotes_select on design_sheet_quotes;
create policy design_sheet_quotes_select on design_sheet_quotes for select using (true);

-- + seed erp_report_templates 2 แถว (entity_type='design_sheet' ใบสั่งตัวอย่าง, 'design_sheet_quote' ใบเสนอราคา)
--   insert แบบ where not exists — แก้หน้าตาใบได้ที่ /admin/report-templates
