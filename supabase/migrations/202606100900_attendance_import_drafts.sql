create table if not exists public.attendance_import_batches (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  source_filename text,
  source_text text,
  duplicate_mode text not null default 'skip' check (duplicate_mode in ('skip', 'replace', 'error')),
  status text not null default 'draft' check (status in ('draft', 'committed', 'cancelled')),
  committed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.attendance_import_batches(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  row_key text not null,
  employee_id uuid references public.employees(id) on delete set null,
  work_date date not null,
  scanner_code text,
  mapped_scanner_code text,
  employee_label text,
  raw_scans jsonb not null default '[]'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  manual_payloads jsonb not null default '[]'::jsonb,
  status text not null default 'blocked' check (status in ('ready', 'review', 'unmapped', 'blocked', 'approved', 'normal', 'skipped', 'committed')),
  note text,
  source_lines jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_import_batches_period_idx
  on public.attendance_import_batches(payroll_period_id, created_at desc);

create index if not exists attendance_import_rows_batch_idx
  on public.attendance_import_rows(batch_id, sort_order);

create unique index if not exists attendance_import_rows_batch_row_key_idx
  on public.attendance_import_rows(batch_id, row_key);

create index if not exists attendance_import_rows_period_employee_date_idx
  on public.attendance_import_rows(payroll_period_id, employee_id, work_date);

create or replace function public.erp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_import_batches_touch_updated_at on public.attendance_import_batches;
create trigger attendance_import_batches_touch_updated_at
before update on public.attendance_import_batches
for each row execute function public.erp_touch_updated_at();

drop trigger if exists attendance_import_rows_touch_updated_at on public.attendance_import_rows;
create trigger attendance_import_rows_touch_updated_at
before update on public.attendance_import_rows
for each row execute function public.erp_touch_updated_at();

alter table public.attendance_import_batches enable row level security;
alter table public.attendance_import_rows enable row level security;

comment on table public.attendance_import_batches
  is 'Payroll attendance scanner import draft batches. API-controlled; service role writes after payroll permission checks.';

comment on table public.attendance_import_rows
  is 'Per-day attendance scanner import rows stored before committing to attendance_entries.';
