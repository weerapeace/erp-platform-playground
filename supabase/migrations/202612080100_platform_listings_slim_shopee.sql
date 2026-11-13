-- ✅ ลงฐานข้อมูลจริงแล้ว 2026-11-13 (เจ้าของอนุญาต "อนุญาตปรับฐานข้อมูล") · ตรวจหลังลง: ผลของ LINE 937 · Lazada 232 · TikTok 899 · Shopee 276 เหมือนเดิมทุกตัวอักษร (md5 ก่อน=หลัง) · สิทธิ์ service_role เท่าเดิม · LINE 1000 แถว ~0.1 วิ
-- ตัวอ่านสินค้าบนร้านแบบเบา (platform_listings_slim) + ช่อง Shopee
--
-- ทำไม: ดึงสินค้าจาก Shopee ผ่าน API แล้ว (raw.shopee = ข้อมูลย่อ: สถานะ/รูปแรก/ตัวเลือก/ราคา/สต๊อก · lib/shopee shopeeItemToCatalogItem)
--   หน้า "สินค้าบนแพลตฟอร์ม" (การ์ดสถานะ/สต๊อก/รูป + มุมมองหน้าร้าน) อ่านผ่านฟังก์ชันนี้ ซึ่งตอนนี้คืน line + lazada + tiktok
--   → สินค้า Shopee จาก API จะขึ้น "ไม่รู้สถานะ" ทุกตัว
-- แก้: เพิ่มคอลัมน์คืนค่า shopee = raw->'shopee' (แกะครั้งเดียวต่อแถวเหมือนช่องอื่น) · ส่วนอื่นเหมือนฉบับล่าสุดทุกตัวอักษร
--   ⚠️ ฐาน = pg_get_functiondef ของจริง 2026-11-13 (= 202612040300_platform_listings_slim_tiktok — line มี giftOption) ต่างแค่คอลัมน์ shopee
--   สินค้า Shopee ที่นำเข้าจากไฟล์ (IG 276 รายการ) ไม่มี raw.shopee → ได้ null เหมือนเดิม
--   เปลี่ยนชนิดผลลัพธ์ของฟังก์ชัน → ต้อง drop แล้ว create ใหม่ (create or replace เปลี่ยนคอลัมน์ผลลัพธ์ไม่ได้)
-- อ่านอย่างเดียว · ไม่แตะข้อมูล · เรียกได้เฉพาะ service_role เหมือนเดิม
-- ใช้ที่: lib/platform-shop-view-server.ts → loadListings() (โค้ดที่ยังไม่อ่านคอลัมน์ shopee ใช้ได้ตามปกติ — แค่ไม่สนคอลัมน์เพิ่ม)

drop function if exists public.platform_listings_slim(uuid, uuid, integer, integer);

create function public.platform_listings_slim(
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
  lazada jsonb,
  tiktok jsonb,
  shopee jsonb
)
language sql
stable
set search_path = public
as $$
  select p.id, p.external_product_id, p.title, p.sku_code, p.matched_parent_sku_id, p.price, p.match_ignored, p.last_imported_at, p.status,
         case when y.ln is not null then jsonb_build_object(
           'id', y.ln->'id', 'isDisplay', y.ln->'isDisplay', 'variants', y.ln->'variants',
           'imageUrls', y.ln->'imageUrls', 'category', y.ln->'category', 'giftOption', y.ln->'giftOption') end,
         y.lz,
         y.tt,
         y.sp
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
    cross join lateral (select p.raw->'line' as ln, p.raw->'lazada' as lz, p.raw->'tiktok' as tt, p.raw->'shopee' as sp offset 0) y
   order by p.created_at desc, p.id
$$;

revoke execute on function public.platform_listings_slim(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.platform_listings_slim(uuid, uuid, integer, integer) to service_role;
