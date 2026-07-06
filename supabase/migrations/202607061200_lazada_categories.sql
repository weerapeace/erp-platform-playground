-- cache ต้นไม้หมวดหมู่ Lazada (Lazada ไม่มี API ค้นหา → ต้องเก็บไว้ค้นเอง) + รหัสหมวด Lazada ต่อหมวดกลาง
create table if not exists lazada_categories (
  id text primary key,
  name text not null,
  parent_id text,
  is_leaf boolean not null default false,
  path text,
  updated_at timestamptz not null default now()
);
create index if not exists lazada_categories_leaf_name on lazada_categories (is_leaf, name);
alter table platform_category_mappings add column if not exists ext_category_id text;
