-- Creative Content / Social module: content posts + per-platform captions + hashtag library
-- ใช้ของกลาง: brands, skus_v2, erp_creative_campaigns. สิทธิ์ใช้ tasks.* (seed แล้ว). RLS server-only.

create table if not exists erp_creative_content (
  id            uuid primary key default gen_random_uuid(),
  content_no    text unique,
  title         text not null,
  campaign_id   uuid references erp_creative_campaigns(id),
  brand_id      uuid references brands(id),
  sku_id        uuid references skus_v2(id),
  product_name  text,
  post_type     text,
  platforms     text[] default '{}',
  status        text not null default 'draft',
  approval_status text not null default 'none',
  scheduled_at  timestamptz,
  published_at  timestamptz,
  published_url text,
  product_links jsonb not null default '[]',
  note          text,
  created_by    uuid,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_creative_content_status    on erp_creative_content (status);
create index if not exists idx_creative_content_scheduled on erp_creative_content (scheduled_at);
create index if not exists idx_creative_content_campaign  on erp_creative_content (campaign_id);

create table if not exists erp_creative_content_captions (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references erp_creative_content(id) on delete cascade,
  platform     text not null,
  caption      text,
  hashtags     text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_creative_captions_content on erp_creative_content_captions (content_id);

create table if not exists erp_creative_hashtags (
  id           uuid primary key default gen_random_uuid(),
  text         text not null unique,
  brand_id     uuid references brands(id),
  category     text default 'general',
  platform     text,
  usage_count  int not null default 0,
  status       text not null default 'active',
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_creative_hashtags_brand    on erp_creative_hashtags (brand_id);
create index if not exists idx_creative_hashtags_category on erp_creative_hashtags (category);

alter table erp_creative_content          enable row level security;
alter table erp_creative_content_captions enable row level security;
alter table erp_creative_hashtags         enable row level security;

insert into erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
values
('creative-content', 'erp_creative_content', 'คอนเทนต์ Social', 'จัดการโพสต์ social + caption หลายแพลตฟอร์ม', 'title', 'physical',
 '{"api_path":"/api/creative-content","entity_type":"creative_content"}'::jsonb, true, 62, 'Creative / Marketing'),
('creative-hashtags', 'erp_creative_hashtags', 'คลัง Hashtag', 'คลังแฮชแท็กกลาง', 'text', 'physical',
 '{"api_path":"/api/creative-hashtags","entity_type":"creative_hashtags"}'::jsonb, true, 63, 'Creative / Marketing')
on conflict (module_key) do nothing;
