-- 🌐 คลังไฟล์ "ดูตามแบรนด์" นับรูปที่ลงเว็บด้วย (โฟลเดอร์ 🌐 รูปบนเว็บ ในอัลบั้มของแต่ละรุ่น)
-- ไม่แก้ตาราง ไม่แตะข้อมูล — แก้แค่ฟังก์ชันนับ (อ่านอย่างเดียว)
--   1) erp_store_listing_image_keys(store_listings) = key รูปทั้งหมดของ 1 แถวหน้าขายบนเว็บ
--      ต้องนับแบบเดียวกับ lib/website-listing-images.ts (รูปบนเว็บ · รูปรายสี · รูปเปิด Hero รุ่น+รายสี ไม่รวมวิดีโอแต่รวมรูปปก · แบนเนอร์)
--   2) erp_artwork_parents เพิ่มคอลัมน์ web_img + รุ่นที่มีแต่รูปเว็บก็โผล่ในรายการ (เปลี่ยนชนิดผลลัพธ์ → drop แล้วสร้างใหม่)
--   3) erp_artwork_brands นับรูปเว็บรวมในแบรนด์
-- เรียกจาก API ฝั่งเซิร์ฟเวอร์ (service_role) เท่านั้น → ถอนสิทธิ์ anon/authenticated

create or replace function public.erp_store_listing_image_keys(l public.store_listings)
returns setof text
language sql
stable
set search_path = public
as $$
  with hero as (
    select l.web_hero -> 'desktop' as m
    union all select l.web_hero -> 'mobile'
    union all select p.value -> 'desktop' from jsonb_each(case when jsonb_typeof(l.web_hero -> 'sku') = 'object' then l.web_hero -> 'sku' else '{}'::jsonb end) p
    union all select p.value -> 'mobile' from jsonb_each(case when jsonb_typeof(l.web_hero -> 'sku') = 'object' then l.web_hero -> 'sku' else '{}'::jsonb end) p
  ), keys as (
    select jsonb_array_elements_text(case when jsonb_typeof(l.web_images) = 'array' then l.web_images else '[]'::jsonb end) as k
    union all
    select v from jsonb_each(case when jsonb_typeof(l.web_sku_images) = 'object' then l.web_sku_images else '{}'::jsonb end) e,
      lateral jsonb_array_elements_text(case jsonb_typeof(e.value) when 'array' then e.value when 'string' then jsonb_build_array(e.value) else '[]'::jsonb end) v
    union all
    select m ->> 'key' from hero where jsonb_typeof(m) = 'object' and coalesce(m ->> 'kind', 'image') <> 'video'
    union all
    select m ->> 'posterKey' from hero where jsonb_typeof(m) = 'object'
    union all
    select b ->> 'imageKey' from jsonb_array_elements(case when jsonb_typeof(l.web_banners) = 'array' then l.web_banners else '[]'::jsonb end) b
  )
  select k from keys where k is not null and btrim(k) <> '';
$$;

drop function if exists public.erp_artwork_parents(uuid);
create function public.erp_artwork_parents(p_brand_id uuid)
returns table(parent_id uuid, code text, name_th text, parent_img bigint, sku_count bigint, sku_img bigint, desc_img bigint, web_img bigint)
language plpgsql
stable
set search_path = public
as $function$
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
    ),
    wimg as (
      select l.parent_sku_id as pid, count(distinct k.key)::bigint as web_img
      from store_listings l cross join lateral erp_store_listing_image_keys(l) as k(key)
      where l.parent_sku_id in (select id from p) group by l.parent_sku_id
    )
    select p.id, p.code, p.name_th,
      coalesce(pimg.parent_img,0)::bigint, coalesce(simg.sku_count,0)::bigint, coalesce(simg.sku_img,0)::bigint,
      coalesce(dimg.desc_img,0)::bigint, coalesce(wimg.web_img,0)::bigint
    from p
    left join pimg on pimg.pid=p.id
    left join simg on simg.pid=p.id
    left join dimg on dimg.pid=p.id
    left join wimg on wimg.pid=p.id
    where coalesce(pimg.parent_img,0)+coalesce(simg.sku_img,0)+coalesce(dimg.desc_img,0)+coalesce(wimg.web_img,0) > 0
    order by p.code
  $q$, brand_cond);
end;
$function$;

create or replace function public.erp_artwork_brands()
returns table(brand_id uuid, brand_name text, brand_color text, parent_count bigint, image_count bigint)
language sql
stable
set search_path = public
as $function$
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
    union all
    select p.brand_id, p.id
    from (select distinct l.parent_sku_id, k.key from store_listings l cross join lateral erp_store_listing_image_keys(l) as k(key)) w
    join parent_skus_v2 p on p.id = w.parent_sku_id
  )
  select b.id, coalesce(b.name,'(ไม่ระบุแบรนด์)'), b.color,
         count(distinct img.parent_id), count(*)
  from img left join brands b on b.id = img.brand_id
  group by b.id, b.name, b.color
  order by count(*) desc;
$function$;

revoke execute on function public.erp_store_listing_image_keys(public.store_listings) from public, anon, authenticated;
revoke execute on function public.erp_artwork_parents(uuid) from public, anon, authenticated;
revoke execute on function public.erp_artwork_brands() from public, anon, authenticated;
grant execute on function public.erp_store_listing_image_keys(public.store_listings) to service_role;
grant execute on function public.erp_artwork_parents(uuid) to service_role;
grant execute on function public.erp_artwork_brands() to service_role;
