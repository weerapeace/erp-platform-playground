alter table public.payroll_pnd3_export_row_overrides
  add column if not exists national_id text,
  add column if not exists address text;

comment on column public.payroll_pnd3_export_row_overrides.national_id
  is 'Row-level PND3 identity/passport override for a payroll period export. Does not update employee master data.';

comment on column public.payroll_pnd3_export_row_overrides.address
  is 'Row-level PND3 address override for a payroll period export. Does not update employee master data.';
