-- SKU การตลาด: เลิก "เลือกรุ่นเข้ารายการ" → หน้าแสดงทุก Parent SKU ที่เปิดใช้งาน
-- view รวม รุ่น + แบรนด์ + ป้าย/หมายเหตุ (marketing_skus = ค่าการตลาดต่อรุ่น สร้างแถวเมื่อมีการติดป้าย/หมายเหตุ)
-- + จำนวน SKU ย่อย (สี/แบบ) ทั้งหมด / ที่ยังเปิดใช้งาน — ให้ DB นับ ไม่ต้องส่ง 13k แถวไปหน้าเว็บ
-- security_invoker = เคารพ RLS ของตารางต้นทาง · ปิดสิทธิ์ anon/authenticated (อ่านผ่าน API service role เท่านั้น)

create or replace view public.marketing_sku_overview with (security_invoker = true) as
select
  p.id                  as parent_sku_id,
  p.code,
  p.name_th,
  p.cover_image_r2_key,
  p.brand_id,
  ms.label_id,
  ms.note,
  ms.updated_at         as marketing_updated_at,
  coalesce(v.total, 0)  as sku_total,
  coalesce(v.active, 0) as sku_active
from public.parent_skus_v2 p
left join public.marketing_skus ms on ms.parent_sku_id = p.id
left join (
  select parent_sku_id, count(*)::int as total, (count(*) filter (where is_active))::int as active
  from public.skus_v2
  where parent_sku_id is not null
  group by parent_sku_id
) v on v.parent_sku_id = p.id
where p.is_active;

revoke all on public.marketing_sku_overview from anon, authenticated;
grant select on public.marketing_sku_overview to service_role;

-- นับสี/แบบต่อรุ่นเร็วขึ้น (index-only scan แทนอ่านทั้งตาราง skus_v2 ~1.7 วิ)
create index if not exists idx_skus_v2_parent_active on public.skus_v2 (parent_sku_id) include (is_active) where parent_sku_id is not null;
