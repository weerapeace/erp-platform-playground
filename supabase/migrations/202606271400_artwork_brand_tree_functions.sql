-- มุมมอง "ดูตามแบรนด์" ของคลังไฟล์ (DAM) — function อ่านอย่างเดียว (stable) นับฝั่ง DB ให้เร็ว
-- รูปผูกสินค้าผ่าน asset_usages: module=parent_sku / product_sku / parent_sku_description, record_id = id::text
-- โครง: แบรนด์ → Parent SKU → [รูป Parent | โฟลเดอร์ SKUs (ย่อยราย SKU) | โฟลเดอร์ Description]

-- 1) รายการแบรนด์ที่มีรูป + จำนวน Parent ที่มีรูป + จำนวนรูปรวม
create or replace function erp_artwork_brands()
returns table(brand_id uuid, brand_name text, brand_color text, parent_count bigint, image_count bigint)
language sql stable as $$
  with img as (
    select p.brand_id, p.id as parent_id
    from asset_usages au join parent_skus_v2 p on p.id::text = au.record_id
    where au.module in ('parent_sku', 'parent_sku_description')
    union all
    select p.brand_id, p.id as parent_id
    from asset_usages au
    join skus_v2 s on s.id::text = au.record_id
    join parent_skus_v2 p on p.id = s.parent_sku_id
    where au.module = 'product_sku'
  )
  select b.id, coalesce(b.name, '(ไม่ระบุแบรนด์)'), b.color,
         count(distinct img.parent_id), count(*)
  from img left join brands b on b.id = img.brand_id
  group by b.id, b.name, b.color
  order by count(*) desc;
$$;

-- 2) Parent ในแบรนด์ (เฉพาะที่มีรูป) + จำนวนแต่ละโฟลเดอร์
create or replace function erp_artwork_parents(p_brand_id uuid)
returns table(parent_id uuid, code text, name_th text, parent_img bigint, sku_count bigint, sku_img bigint, desc_img bigint)
language sql stable as $$
  select * from (
    select p.id, p.code, p.name_th,
      (select count(*) from asset_usages au where au.module='parent_sku' and au.record_id = p.id::text),
      (select count(distinct s.id) from skus_v2 s join asset_usages au on au.module='product_sku' and au.record_id = s.id::text where s.parent_sku_id = p.id),
      (select count(*) from asset_usages au join skus_v2 s on s.id::text=au.record_id where au.module='product_sku' and s.parent_sku_id = p.id),
      (select count(*) from asset_usages au where au.module='parent_sku_description' and au.record_id = p.id::text)
    from parent_skus_v2 p
    where (p_brand_id is null and p.brand_id is null) or (p.brand_id = p_brand_id)
  ) t(parent_id, code, name_th, parent_img, sku_count, sku_img, desc_img)
  where t.parent_img + t.sku_img + t.desc_img > 0
  order by t.code;
$$;
