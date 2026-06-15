-- Phase B — เพิ่ม Parent SKU ในงาน creative (additive)
alter table erp_creative_tasks add column if not exists parent_sku_id uuid references parent_skus_v2(id);
create index if not exists idx_creative_tasks_parent_sku on erp_creative_tasks(parent_sku_id);
