-- ตารางคำนวณบนกระดาน (spreadsheet card) — เก็บช่อง/สูตรของแต่ละการ์ดตาราง (การ์ดผูกด้วย id ใน customData)
create table if not exists erp_canvas_tables (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  data jsonb not null default '[]'::jsonb,   -- string[][] (เนื้อในช่องดิบ: ค่า/ข้อความ/สูตร "=A1+B1")
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
comment on table erp_canvas_tables is 'ตารางคำนวณ (spreadsheet) บนกระดานแคมเปญ — การ์ดผูกด้วย id ใน customData';
