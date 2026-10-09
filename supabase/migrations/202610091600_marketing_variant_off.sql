-- SKU การตลาด: ปิดสี/แบบ "เฉพาะการตลาด" (ไม่แตะ skus_v2.is_active — สียังขาย/สั่งซื้อ/ผลิตได้ปกติ)
-- มีแถว = ทีมการตลาดปิดสีนี้ · เปิดกลับ = ลบแถว
create table if not exists public.marketing_sku_variant_off (
  sku_id uuid primary key references public.skus_v2(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.marketing_sku_variant_off enable row level security;

-- "SKU ที่เหลือ" = สีที่เปิดในระบบ และไม่ถูกการตลาดปิด
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
  greatest(coalesce(v.active, 0) - coalesce(o.off_active, 0), 0) as sku_active
from public.parent_skus_v2 p
left join public.marketing_skus ms on ms.parent_sku_id = p.id
left join (
  select parent_sku_id, count(*)::int as total, (count(*) filter (where is_active))::int as active
  from public.skus_v2
  where parent_sku_id is not null
  group by parent_sku_id
) v on v.parent_sku_id = p.id
left join (
  select s.parent_sku_id, count(*)::int as off_active
  from public.marketing_sku_variant_off f
  join public.skus_v2 s on s.id = f.sku_id and s.is_active
  group by s.parent_sku_id
) o on o.parent_sku_id = p.id
where p.is_active;

revoke all on public.marketing_sku_overview from anon, authenticated;
grant select on public.marketing_sku_overview to service_role;
