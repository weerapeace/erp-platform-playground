alter table public.offer_sheets
  add column if not exists column_config jsonb;

comment on column public.offer_sheets.column_config is
  'Per-offer line column layout. Keeps product table columns/grouping scoped to this offer instead of app_settings.';
