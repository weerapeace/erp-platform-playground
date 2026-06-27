-- มุมมอง "ดูตามแบรนด์": ให้ตัวนับรูป (ลิสต์แบรนด์ + ลิสต์ Parent) รวม "รูปภาพเพิ่มเติม"
-- (erp_playground_attachments) ด้วย ไม่ใช่นับแค่ asset_usages(Odoo) → badge ตรง + Parent ที่มีแต่รูปอัปใหม่ก็โผล่
-- erp_playground_attachments เล็ก (≈39 แถว) มี idx_pg_attachments_entity → ไม่กระทบ perf

create or replace function erp_artwork_brands()
returns table(brand_id uuid, brand_name text, brand_color text, parent_count bigint, image_count bigint)
language sql stable as $$
  with img as (
    select p.brand_id, p.id as parent_id
    from asset_usages au join parent_skus_v2 p on p.id::text = au.record_id
    where au.module in ('parent_sku','parent_sku_description')
    union all
    select p.brand_id, p.id
    from erp_playground_attachments a join parent_skus_v2 p on p.id = a.entity_id
    where a.entity_type = 'parent_skus_v2'
    union all
    select p.brand_id, p.id
    from asset_usages au join skus_v2 s on s.id::text = au.record_id join parent_skus_v2 p on p.id = s.parent_sku_id
    where au.module = 'product_sku'
    union all
    select p.brand_id, p.id
    from erp_playground_attachments a join skus_v2 s on s.id = a.entity_id join parent_skus_v2 p on p.id = s.parent_sku_id
    where a.entity_type = 'skus_v2'
  )
  select b.id, coalesce(b.name,'(ไม่ระบุแบรนด์)'), b.color,
         count(distinct img.parent_id), count(*)
  from img left join brands b on b.id = img.brand_id
  group by b.id, b.name, b.color
  order by count(*) desc;
$$;

create or replace function erp_artwork_parents(p_brand_id uuid)
returns table(parent_id uuid, code text, name_th text, parent_img bigint, sku_count bigint, sku_img bigint, desc_img bigint)
language plpgsql stable as $$
declare brand_cond text;
begin
  brand_cond := case when p_brand_id is null then 'brand_id is null' else format('brand_id = %L', p_brand_id) end;
  return query execute format($q$
    with p as (select id, code, name_th from parent_skus_v2 where %s),
    pimg as (
      select pid, sum(c)::bigint as parent_img from (
        select au.record_id::uuid as pid, count(*) c from asset_usages au where au.module='parent_sku' and au.record_id in (select id::text from p) group by au.record_id
        union all
        select a.entity_id as pid, count(*) c from erp_playground_attachments a where a.entity_type='parent_skus_v2' and a.entity_id in (select id from p) group by a.entity_id
      ) z group by pid
    ),
    dimg as (
      select au.record_id::uuid as pid, count(*)::bigint as desc_img
      from asset_usages au where au.module='parent_sku_description' and au.record_id in (select id::text from p) group by au.record_id
    ),
    simg as (
      select parent_sku_id as pid, count(distinct sid)::bigint as sku_count, sum(c)::bigint as sku_img from (
        select s.id as sid, s.parent_sku_id, count(au.asset_id) c
        from skus_v2 s join asset_usages au on au.module='product_sku' and au.record_id=s.id::text
        where s.parent_sku_id in (select id from p) group by s.id, s.parent_sku_id
        union all
        select s.id as sid, s.parent_sku_id, count(a.id) c
        from skus_v2 s join erp_playground_attachments a on a.entity_type='skus_v2' and a.entity_id=s.id
        where s.parent_sku_id in (select id from p) group by s.id, s.parent_sku_id
      ) z group by parent_sku_id
    )
    select p.id, p.code, p.name_th,
      coalesce(pimg.parent_img,0)::bigint, coalesce(simg.sku_count,0)::bigint, coalesce(simg.sku_img,0)::bigint, coalesce(dimg.desc_img,0)::bigint
    from p
    left join pimg on pimg.pid=p.id
    left join simg on simg.pid=p.id
    left join dimg on dimg.pid=p.id
    where coalesce(pimg.parent_img,0)+coalesce(simg.sku_img,0)+coalesce(dimg.desc_img,0) > 0
    order by p.code
  $q$, brand_cond);
end;
$$;
