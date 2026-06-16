-- ระบบแม่แบบแคปชั่น (caption templates) + ช่องทางร้านต่อแบรนด์ + ราคาเต็ม/ลดต่อโพสต์
-- ใช้ตัวแปร {caption} {hashtags} {shop} {fake_price} {real_price} {price} {color} {sku} {product}

-- 1) ช่องทางร้านต่อแบรนด์ (Shopee/Lazada/Tiktok/Line ...) — jsonb [{label, value}]
alter table brands add column if not exists shop_channels jsonb not null default '[]'::jsonb;

-- 2) ส่วนลดต่อโพสต์ (fake_price = ราคา SKU, real_price = ราคา SKU − ส่วนลด)
alter table erp_creative_content add column if not exists discount_value numeric;
alter table erp_creative_content add column if not exists discount_is_percent boolean not null default false;

-- 3) แม่แบบแคปชั่น (ต่อแบรนด์ + ค่ากลาง brand_id = null)
create table if not exists erp_creative_caption_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  key text not null,                 -- short / landing / product_links / page_links
  label text not null,
  body text not null default '',     -- ข้อความแม่แบบ มีตัวแปร {...}
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_caption_tpl_brand on erp_creative_caption_templates (brand_id, sort_order);

-- 4) ค่ากลาง (global default, brand_id = null) — seed ถ้ายังไม่มี
insert into erp_creative_caption_templates (brand_id, key, label, body, sort_order)
select null, v.key, v.label, v.body, v.sort_order
from (values
  ('short', 'Short', E'{caption}\n\n{hashtags}', 0),
  ('landing', 'Landing Page (Instagram)', E'{caption}\n\nShop now\n{shop}\n\nPrice: ลดราคาจาก {fake_price} เหลือเพียง {real_price}\n\n{hashtags}', 1),
  ('product_links', 'Product Links', E'{caption}\n\n🛒 สั่งซื้อ\n{shop}\n\nราคา {real_price} บาท\n\n{hashtags}', 2),
  ('page_links', 'Page Links', E'{caption}\n\nราคา {real_price} บาท\n\n{hashtags}', 3)
) as v(key, label, body, sort_order)
where not exists (
  select 1 from erp_creative_caption_templates t where t.brand_id is null and t.key = v.key
);
