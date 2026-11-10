-- platform_listings_slim: เพิ่ม giftOption ในก้อน line (การ์ดกอง "ยังไม่เปิดของขวัญ" ในมุมมองหน้าร้าน · เจ้าของขอ 2026-11-10)
-- LINE ไม่ให้ตั้งของขวัญผ่าน API → ต้องติ๊กเองใน Seller Center · กองนี้บอกว่าตัวไหนยังไม่เปิด
-- คืนคอลัมน์เดิมทุกตัว (ลายเซ็นเดิม) · แค่ line มีช่อง giftOption เพิ่ม · ยังแกะ raw ครั้งเดียวต่อแถวเหมือนเดิม

create or replace function public.platform_listings_slim(
  p_platform_id uuid,
  p_brand_id uuid default null,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  id uuid,
  external_product_id text,
  title text,
  sku_code text,
  matched_parent_sku_id uuid,
  price numeric,
  match_ignored boolean,
  last_imported_at timestamptz,
  status text,
  line jsonb,
  lazada jsonb
)
language sql
stable
set search_path = public
as $$
  select p.id, p.external_product_id, p.title, p.sku_code, p.matched_parent_sku_id, p.price, p.match_ignored, p.last_imported_at, p.status,
         case when y.ln is not null then jsonb_build_object(
           'id', y.ln->'id', 'isDisplay', y.ln->'isDisplay', 'variants', y.ln->'variants',
           'imageUrls', y.ln->'imageUrls', 'category', y.ln->'category', 'giftOption', y.ln->'giftOption') end,
         y.lz
    from (
      select l.id, l.external_product_id, l.title, l.sku_code, l.matched_parent_sku_id, l.price, l.match_ignored,
             l.last_imported_at, l.status, l.raw, l.created_at
        from public.platform_catalog_listings l
       where l.platform_id = p_platform_id
         and (p_brand_id is null or l.brand_id = p_brand_id)
       order by l.created_at desc, l.id
       limit greatest(coalesce(p_limit, 1000), 0) offset greatest(coalesce(p_offset, 0), 0)
    ) p
    cross join lateral (select p.raw->'line' as ln, p.raw->'lazada' as lz offset 0) y
   order by p.created_at desc, p.id
$$;

revoke execute on function public.platform_listings_slim(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.platform_listings_slim(uuid, uuid, integer, integer) to service_role;
