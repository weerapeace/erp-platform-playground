-- Phase 1 upload role grants
-- Keep destructive file deletion and payroll calculation admin-only.

insert into public.erp_role_permissions (role_key, permission_key)
select role_key, 'files.upload'
from (
  values
    ('manager'),
    ('staff')
) as roles(role_key)
on conflict (role_key, permission_key) do nothing;
