-- อ่านสินค้าบนร้าน (หน้า "สินค้าบนแพลตฟอร์ม" → มุมมองหน้าร้าน + การ์ดรูป/สต๊อกในแท็บจับคู่) แบบเบา
--
-- เดิม: PostgREST select raw->line->id / isDisplay / variants / imageUrls / category + raw->lazada (6 ช่อง)
--   → Postgres แกะข้อมูลดิบทั้งก้อน (~10KB/สินค้า มีคำบรรยายยาว) ใหม่ "ทุกช่อง" = 6 รอบต่อสินค้า
--   + แบ่งหน้า (order by + range) หน้าที่ 2 ยังคำนวณทุกแถวใหม่ → LINE Louis Montini 931 รายการ ~1.6 วิ/หน้า × 2 หน้า (สูงสุด 6.8 วิ/หน้า)
-- ใหม่: เรียงด้วยคอลัมน์เบาก่อน → ตัดหน้า → ค่อยแกะข้อมูลดิบครั้งเดียวต่อแถว ส่งเฉพาะช่องที่ใช้ (~0.1 วิ ทั้งร้าน)
-- คืนรูปเดียวกับที่โค้ดเดิมประกอบ (line = { id, isDisplay, variants, imageUrls, category } · lazada = raw->lazada ทั้งก้อน)
-- อ่านอย่างเดียว · security invoker · เรียกได้เฉพาะ service_role (API ผ่าน guardApi + supabaseAdmin)
-- ใช้ที่: lib/platform-shop-view-server.ts → loadListings()

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
           'imageUrls', y.ln->'imageUrls', 'category', y.ln->'category') end,
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
    -- offset 0 = กันตัววางแผนรวมกลับเข้าแถวบน (จะกลายเป็นแกะ raw ซ้ำทุกช่องเหมือนเดิม)
    cross join lateral (select p.raw->'line' as ln, p.raw->'lazada' as lz offset 0) y
   order by p.created_at desc, p.id
$$;

revoke execute on function public.platform_listings_slim(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.platform_listings_slim(uuid, uuid, integer, integer) to service_role;
