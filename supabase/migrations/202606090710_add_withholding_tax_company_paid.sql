alter table public.employee_payroll_settings
  add column if not exists withholding_tax_company_paid boolean not null default false;

comment on column public.employee_payroll_settings.withholding_tax_company_paid
  is 'If true, withholding tax is paid by company and not deducted from employee net pay.';
