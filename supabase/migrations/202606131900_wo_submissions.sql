-- การส่งงานรายครั้ง (ช่างส่งงานเสร็จกลับมา) — ป้อน "ตารางส่งงาน" + โกดัง QC
create table if not exists public.wo_submissions (
  id              uuid primary key default gen_random_uuid(),
  wo_id           uuid references public.mo_work_orders(id) on delete cascade,
  wo_no           text,
  mo_no           text,
  sku             text,
  sku_name        text,
  craftsman_id    uuid,
  craftsman_name  text,
  department_name text,
  qty             numeric not null default 0,
  wage            numeric,
  submitted_at    date not null default current_date,
  due_date        date,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists wo_submissions_wo_idx on public.wo_submissions(wo_id);
create index if not exists wo_submissions_submitted_idx on public.wo_submissions(submitted_at desc);
alter table public.wo_submissions enable row level security;
