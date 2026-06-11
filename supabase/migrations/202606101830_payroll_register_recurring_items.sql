create table if not exists public.payroll_register_recurring_items (
  id uuid primary key default gen_random_uuid(),
  recipient_code text,
  recipient_name text not null,
  nickname text,
  nationality text,
  national_id text,
  passport_no text,
  register_base_salary numeric(12,2) not null default 0,
  register_mid_month_paid numeric(12,2) not null default 0,
  register_month_end_pay numeric(12,2) not null default 0,
  register_transfer_net_pay numeric(12,2) not null default 0,
  register_overtime_amount numeric(12,2) not null default 0,
  register_cash_pay numeric(12,2) not null default 0,
  register_social_security numeric(12,2) not null default 0,
  register_balance numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  display_order integer not null default 100,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payroll_register_recurring_items_status
  on public.payroll_register_recurring_items(status, display_order, recipient_name);

alter table public.payroll_register_recurring_items enable row level security;

drop policy if exists payroll_register_recurring_items_select on public.payroll_register_recurring_items;
drop policy if exists payroll_register_recurring_items_write on public.payroll_register_recurring_items;

create policy payroll_register_recurring_items_select
  on public.payroll_register_recurring_items
  for select
  using (auth.role() = 'authenticated');

create policy payroll_register_recurring_items_write
  on public.payroll_register_recurring_items
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

grant select, insert, update, delete on public.payroll_register_recurring_items to authenticated;

comment on table public.payroll_register_recurring_items
  is 'Recurring external recipients for payroll register Excel exports.';
comment on column public.payroll_register_recurring_items.register_transfer_net_pay
  is 'Net salary amount shown in payroll register export.';
