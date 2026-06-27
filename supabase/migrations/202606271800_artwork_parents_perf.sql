-- เร่งมุมมอง "ดูตามแบรนด์" (โหลดช้าตอนเปิดแบรนด์ใหญ่ เช่น Louis Montini 627 Parent)
-- 1) index ที่ asset_usages(module, record_id) — record_id เป็น text ไม่มี index → join เป็น full scan
create index if not exists idx_asset_usages_module_record on asset_usages (module, record_id);

-- 2) erp_artwork_parents: SQL function รับ parameter → planner ทำ generic plan แย่
--    เปลี่ยนเป็น plpgsql + EXECUTE format() ฝัง brand_id เป็นค่าคงที่ → planner ได้ custom plan
--    (หมายเหตุ: ความช้าที่เหลือส่วนใหญ่เป็น cold-cache I/O ของ instance — แก้ฝั่งแอปด้วย Cache-Control)
create or replace function erp_artwork_parents(p_brand_id uuid)
returns table(parent_id uuid, code text, name_th text, parent_img bigint, sku_count bigint, sku_img bigint, desc_img bigint)
language plpgsql stable as $$
declare brand_cond text;
begin
  brand_cond := case when p_brand_id is null then 'brand_id is null' else format('brand_id = %L', p_brand_id) end;
  return query execute format($q$
    with p as (select id, code, name_th from parent_skus_v2 where %s),
    pimg as (
      select au.record_id::uuid as pid,
             count(*) filter (where au.module = 'parent_sku') as parent_img,
             count(*) filter (where au.module = 'parent_sku_description') as desc_img
      from asset_usages au
      where au.module in ('parent_sku', 'parent_sku_description') and au.record_id in (select id::text from p)
      group by au.record_id
    ),
    simg as (
      select s.parent_sku_id as pid, count(distinct s.id) as sku_count, count(au.asset_id) as sku_img
      from skus_v2 s join asset_usages au on au.module = 'product_sku' and au.record_id = s.id::text
      where s.parent_sku_id in (select id from p)
      group by s.parent_sku_id
    )
    select p.id, p.code, p.name_th,
           coalesce(pimg.parent_img, 0), coalesce(simg.sku_count, 0), coalesce(simg.sku_img, 0), coalesce(pimg.desc_img, 0)
    from p
    left join pimg on pimg.pid = p.id
    left join simg on simg.pid = p.id
    where coalesce(pimg.parent_img, 0) + coalesce(simg.sku_img, 0) + coalesce(pimg.desc_img, 0) > 0
    order by p.code
  $q$, brand_cond);
end;
$$;
