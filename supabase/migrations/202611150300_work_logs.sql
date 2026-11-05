-- 📝 ใบจดผลงาน (Work Logs) — เจ้าของอนุมัติ 2026-11-05: "Approve, start" (เฟส 2a: ถ่ายรูป → AI อ่าน → หน้าตรวจ → ยืนยัน)
--   ใบจดพิมพ์จาก /print/work-steps/<mo_id>?mode=worklog (lib/work-log-sheet.ts) · QR ทุกหน้า = WL1|mo_id|หน้า/ทั้งหมด|บรรทัดต่อขั้น|รหัสขั้นตอน
--   work_log_sheets  = รูปที่ส่งเข้ามา 1 แถว/รูป (เก็บผลที่ AI อ่าน + สถานะ) — ย้อนดูรูปต้นฉบับได้เสมอ
--   work_log_entries = บรรทัดที่ยืนยันแล้ว 1 แถว/บรรทัด — ข้อมูลตั้งต้นของ "ชิ้นต่อชั่วโมง" และค่ามาตรฐาน (เฟส 2b)
--     line_key = "p<หน้า>:r<แถว>" ต่อใบสั่งผลิต → ถ่ายใบเดิมซ้ำ (จดเพิ่มวันถัดไป) = อัปเดตบรรทัดเดิม ไม่ซ้ำ
--   เข้าถึงผ่าน API (/api/work-logs) ด้วย service role เท่านั้น (เหมือน print_logs) · รูปเก็บ Supabase ส่วนตัวตามกฎหมวด work_logs

create table if not exists public.work_log_sheets (
  id uuid primary key default gen_random_uuid(),
  mo_id uuid references public.manufacturing_orders(id) on delete set null,
  mo_no text,
  page_no integer,
  page_total integer,
  lines_per_step integer,
  qr_text text,
  file_ref text not null,
  status text not null default 'reading' check (status in ('reading', 'review', 'confirmed', 'discarded', 'failed')),
  ai_model text,
  ai_result jsonb,
  ai_error text,
  read_at timestamptz,
  uploaded_by uuid,
  uploaded_by_name text,
  confirmed_by uuid,
  confirmed_by_name text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_log_sheets_mo_idx on public.work_log_sheets (mo_id, page_no);
create index if not exists work_log_sheets_status_idx on public.work_log_sheets (status, created_at desc);

create table if not exists public.work_log_entries (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid references public.work_log_sheets(id) on delete set null,
  mo_id uuid references public.manufacturing_orders(id) on delete set null,
  mo_no text,
  line_key text not null,
  step_id uuid,
  step_code text,
  step_name text not null,
  employee_id uuid references public.employees(id) on delete set null,
  name_written text,
  work_date date,
  start_time time,
  end_time time,
  minutes integer check (minutes is null or minutes >= 0),
  qty_done integer check (qty_done is null or qty_done >= 0),
  qty_waste integer check (qty_waste is null or qty_waste >= 0),
  step_done boolean not null default false,
  note text,
  is_active boolean not null default true,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mo_id, line_key)
);
create index if not exists work_log_entries_emp_idx on public.work_log_entries (employee_id, work_date desc);
create index if not exists work_log_entries_step_idx on public.work_log_entries (step_id, work_date desc);
create index if not exists work_log_entries_date_idx on public.work_log_entries (work_date desc);

alter table public.work_log_sheets enable row level security;
alter table public.work_log_entries enable row level security;
revoke all on public.work_log_sheets from anon, authenticated;
revoke all on public.work_log_entries from anon, authenticated;

-- กฎที่เก็บไฟล์: รูปใบจดมีชื่อพนักงาน + ผลงาน → Supabase ส่วนตัว (ล็อก)
insert into public.erp_storage_rules (rule_key, label, label_en, description, file_types, provider, allowed_providers, lock_reason, max_bytes, sort_order, is_active)
select 'work_logs', 'ใบจดผลงาน (รูปถ่าย)', 'Work log sheet photos',
       'รูปใบจดผลงานที่หัวหน้าถ่ายส่งเข้าระบบ ให้ AI อ่าน',
       array['jpg', 'jpeg', 'png', 'webp'], 'supabase', array['supabase'],
       'มีชื่อพนักงานและผลงาน เปิดได้เฉพาะคนที่มีสิทธิ์', 15728640, 130, true
where not exists (select 1 from public.erp_storage_rules where rule_key = 'work_logs');
