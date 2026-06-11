create table if not exists public.payroll_pnd3_allocation_overrides (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  target_selection_id text not null,
  target_source text not null check (target_source in ('employee', 'pnd3_recurring')),
  target_label text not null default '',
  is_selected boolean not null default false,
  is_fixed boolean not null default false,
  fixed_net_amount numeric(14,2) not null default 0 check (fixed_net_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, target_selection_id)
);

create index if not exists idx_payroll_pnd3_allocation_overrides_period
  on public.payroll_pnd3_allocation_overrides(payroll_period_id, target_source);

alter table public.payroll_pnd3_allocation_overrides enable row level security;

drop policy if exists payroll_pnd3_allocation_overrides_select on public.payroll_pnd3_allocation_overrides;
drop policy if exists payroll_pnd3_allocation_overrides_write on public.payroll_pnd3_allocation_overrides;

create policy payroll_pnd3_allocation_overrides_select
  on public.payroll_pnd3_allocation_overrides
  for select
  to authenticated
  using (erp_can('employees.view'));

create policy payroll_pnd3_allocation_overrides_write
  on public.payroll_pnd3_allocation_overrides
  for all
  to authenticated
  using (erp_can('employees.edit'))
  with check (erp_can('employees.edit'));

grant select, insert, update, delete on public.payroll_pnd3_allocation_overrides to authenticated, service_role;

comment on table public.payroll_pnd3_allocation_overrides
  is 'Stores per-period PND3 allocation choices for pooling foreign daily payroll net amounts onto selected Thai/recurring PND3 recipients.';
comment on column public.payroll_pnd3_allocation_overrides.fixed_net_amount
  is 'Net amount reserved for this recipient before the remaining pool is spread to non-fixed selected recipients.';
