alter table public.offer_sheets
  add column if not exists template_key text not null default 'price_list';

comment on column public.offer_sheets.template_key is
  'Per-offer proposal template key, scoped to each offer sheet.';
