-- Phase 1.2: register granular permissions used by Phase 1.1 API guards.
-- Safe to re-run: permission definitions are upserted, admin grants are inserted once.

with new_permissions(permission_key, label, category, description, is_dangerous, sort_order) as (
  values
    ('admin.schema.view', 'View database schema metadata', 'Admin / Schema', 'View table and column metadata for Field Creator.', false, 1010),
    ('admin.schema.create_table', 'Create ERP module table', 'Admin / Schema', 'Create a new ERP module table from admin tools.', true, 1020),
    ('admin.schema.add_field', 'Add ERP field or column', 'Admin / Schema', 'Add a field and optionally a physical database column.', true, 1030),
    ('admin.schema.delete_field', 'Delete ERP field or column', 'Admin / Schema', 'Delete a field and optionally a physical database column.', true, 1040),
    ('admin.module_layout.edit', 'Edit module form layout', 'Admin / Layout', 'Edit the shared form layout for an ERP module.', false, 1110),
    ('admin.field_registry.edit', 'Edit field registry', 'Admin / Field Registry', 'Edit one Field Registry entry.', false, 1210),
    ('admin.field_registry.bulk_edit', 'Bulk edit field registry', 'Admin / Field Registry', 'Bulk update or reorder Field Registry entries.', true, 1220),
    ('files.upload', 'Upload files', 'Files', 'Upload files to storage/R2.', false, 1310),
    ('files.delete', 'Delete files', 'Files', 'Delete files from storage/R2.', true, 1320),
    ('payroll.calculate', 'Run payroll calculation', 'Payroll', 'Run payroll calculation as a background job.', true, 1410)
)
insert into public.erp_permissions (
  key,
  label,
  category,
  description,
  is_dangerous,
  sort_order
)
select
  permission_key,
  label,
  category,
  description,
  is_dangerous,
  sort_order
from new_permissions
on conflict (key) do update
set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  is_dangerous = excluded.is_dangerous,
  sort_order = excluded.sort_order;

with new_permissions(permission_key) as (
  values
    ('admin.schema.view'),
    ('admin.schema.create_table'),
    ('admin.schema.add_field'),
    ('admin.schema.delete_field'),
    ('admin.module_layout.edit'),
    ('admin.field_registry.edit'),
    ('admin.field_registry.bulk_edit'),
    ('files.upload'),
    ('files.delete'),
    ('payroll.calculate')
)
insert into public.erp_role_permissions (
  role_key,
  permission_key
)
select
  'admin',
  permission_key
from new_permissions
on conflict (role_key, permission_key) do nothing;
