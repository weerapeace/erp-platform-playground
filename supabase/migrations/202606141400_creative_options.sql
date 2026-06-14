-- ตัวเลือกที่ผู้ใช้จัดการได้เอง (ประเภทงาน / แพลตฟอร์ม) — แก้ที่เดียว ใช้ทุกฟอร์ม
create table if not exists erp_creative_options (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                 -- 'task_type' | 'platform'
  key         text not null,
  label       text not null,
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, key)
);
create index if not exists idx_creative_options_kind on erp_creative_options (kind, is_active, sort_order);
alter table erp_creative_options enable row level security;

insert into erp_creative_options (kind, key, label, sort_order) values
  ('task_type','photo_shoot','ถ่ายรูปสินค้า',10),
  ('task_type','photo_edit','แต่งรูปสินค้า',20),
  ('task_type','product_image','รูปสินค้า (ปก/Detail)',30),
  ('task_type','banner','Content Banner',40),
  ('task_type','promote_banner','Banner โปรโมต',50),
  ('task_type','video','Video Content',60),
  ('task_type','social_post','โพสต์ Social',70),
  ('task_type','product_listing','ลงสินค้า Marketplace',80),
  ('task_type','caption','เขียน Caption',90),
  ('task_type','hashtag','หา Hashtag',100),
  ('task_type','campaign_plan','วางแผนแคมเปญ',110),
  ('task_type','approval','งานอนุมัติ',120),
  ('task_type','other','อื่น ๆ',130),
  ('platform','shopee','Shopee',10),
  ('platform','lazada','Lazada',20),
  ('platform','website','Website',30),
  ('platform','instagram','Instagram',40),
  ('platform','tiktok','TikTok',50),
  ('platform','facebook','Facebook',60),
  ('platform','line_oa','LINE OA',70),
  ('platform','youtube','YouTube',80),
  ('platform','pinterest','Pinterest',90),
  ('platform','x','X',100)
on conflict (kind, key) do nothing;
