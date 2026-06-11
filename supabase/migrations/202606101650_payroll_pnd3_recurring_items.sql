create table if not exists public.payroll_pnd3_recurring_items (
  id uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  tax_id text not null default '',
  address text not null default '',
  income_type text not null default 'ค่าจ้าง',
  default_net_amount numeric(14,2) not null default 0 check (default_net_amount >= 0),
  tax_rate numeric(5,2) not null default 3 check (tax_rate >= 0 and tax_rate < 100),
  status text not null default 'active' check (status in ('active', 'inactive')),
  display_order integer not null default 100,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payroll_pnd3_recurring_items_status
  on public.payroll_pnd3_recurring_items(status, display_order, recipient_name);

alter table public.payroll_pnd3_recurring_items enable row level security;

drop policy if exists payroll_pnd3_recurring_items_select on public.payroll_pnd3_recurring_items;
drop policy if exists payroll_pnd3_recurring_items_write on public.payroll_pnd3_recurring_items;

create policy payroll_pnd3_recurring_items_select
  on public.payroll_pnd3_recurring_items
  for select
  to authenticated
  using (erp_can('employees.view'));

create policy payroll_pnd3_recurring_items_write
  on public.payroll_pnd3_recurring_items
  for all
  to authenticated
  using (erp_can('employees.edit'))
  with check (erp_can('employees.edit'));

grant select, insert, update, delete on public.payroll_pnd3_recurring_items to authenticated;

comment on table public.payroll_pnd3_recurring_items
  is 'Recurring external/person rows for Payroll PND3 export preview and Excel download.';
comment on column public.payroll_pnd3_recurring_items.default_net_amount
  is 'Default net amount used to gross-up amount and withholding tax for PND3.';
comment on column public.payroll_pnd3_recurring_items.tax_rate
  is 'Withholding tax rate percent. Default 3 means gross = net / 0.97.';
