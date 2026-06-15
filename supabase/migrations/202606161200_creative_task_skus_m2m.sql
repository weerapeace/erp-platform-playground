-- ② งาน ↔ SKU / Parent SKU แบบ m2m (additive; คง sku_id/parent_sku_id เดิมไว้เป็น fallback)
create table if not exists erp_creative_task_skus (
  task_id uuid not null references erp_creative_tasks(id) on delete cascade,
  sku_id uuid not null references skus_v2(id) on delete cascade,
  primary key (task_id, sku_id)
);
create index if not exists idx_cts_sku on erp_creative_task_skus(sku_id);

create table if not exists erp_creative_task_parent_skus (
  task_id uuid not null references erp_creative_tasks(id) on delete cascade,
  parent_sku_id uuid not null references parent_skus_v2(id) on delete cascade,
  primary key (task_id, parent_sku_id)
);
create index if not exists idx_ctps_parent on erp_creative_task_parent_skus(parent_sku_id);

insert into erp_creative_task_skus (task_id, sku_id)
select id, sku_id from erp_creative_tasks where sku_id is not null on conflict do nothing;

insert into erp_creative_task_parent_skus (task_id, parent_sku_id)
select id, parent_sku_id from erp_creative_tasks where parent_sku_id is not null on conflict do nothing;
