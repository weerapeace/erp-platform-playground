create table if not exists public.payroll_pnd3_export_row_overrides (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  row_key text not null,
  base_selection_id text not null,
  payment_date date,
  net_pay numeric(14,2) check (net_pay is null or net_pay >= 0),
  is_extra boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, row_key)
);

create index if not exists idx_payroll_pnd3_export_row_overrides_period
  on public.payroll_pnd3_export_row_overrides(payroll_period_id, base_selection_id, display_order);

alter table public.payroll_pnd3_export_row_overrides enable row level security;

drop policy if exists payroll_pnd3_export_row_overrides_select on public.payroll_pnd3_export_row_overrides;
drop policy if exists payroll_pnd3_export_row_overrides_write on public.payroll_pnd3_export_row_overrides;

create policy payroll_pnd3_export_row_overrides_select
  on public.payroll_pnd3_export_row_overrides
  for select
  to authenticated
  using (erp_can('employees.view'));

create policy payroll_pnd3_export_row_overrides_write
  on public.payroll_pnd3_export_row_overrides
  for all
  to authenticated
  using (erp_can('employees.edit'))
  with check (erp_can('employees.edit'));

grant select, insert, update, delete on public.payroll_pnd3_export_row_overrides to authenticated, service_role;

comment on table public.payroll_pnd3_export_row_overrides
  is 'Stores per-period PND3 report row edits such as copied rows, row-specific dates, and row-specific net amounts without changing payroll calculation lines.';
comment on column public.payroll_pnd3_export_row_overrides.row_key
  is 'Stable row id used by the PND3 export UI; base rows use their selection id, copied rows use a generated key.';
comment on column public.payroll_pnd3_export_row_overrides.net_pay
  is 'Optional row-level desired net amount. When set, gross amount and withholding tax are grossed up for PND3 export only.';
