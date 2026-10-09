-- SKU การตลาด: "ป้ายเสริม" (badge) ติดได้หลายป้ายต่อรุ่น · โชว์เป็นชิปบนรูป · พิมพ์คำใหม่เพิ่มเองได้
-- ใช้ตารางป้ายเดิม marketing_sku_labels แยกด้วย kind: 'status' = ป้ายหลัก (1 ป้าย/รุ่น) · 'badge' = ป้ายเสริม

alter table public.marketing_sku_labels add column if not exists kind text not null default 'status';
do $$ begin
  alter table public.marketing_sku_labels add constraint marketing_sku_labels_kind_chk check (kind in ('status', 'badge'));
exception when duplicate_object then null; end $$;

-- ชื่อซ้ำได้ข้ามชนิด (เช่น "Hero" เป็นทั้งป้ายหลักและป้ายเสริม) แต่ห้ามซ้ำในชนิดเดียวกัน
drop index if exists public.uq_marketing_sku_labels_name;
create unique index if not exists uq_marketing_sku_labels_kind_name on public.marketing_sku_labels (kind, lower(name));

create table if not exists public.marketing_sku_badge_map (
  parent_sku_id uuid not null references public.parent_skus_v2(id) on delete cascade,
  badge_id uuid not null references public.marketing_sku_labels(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (parent_sku_id, badge_id)
);
create index if not exists ix_marketing_sku_badge_map_badge on public.marketing_sku_badge_map (badge_id);
alter table public.marketing_sku_badge_map enable row level security;

-- ป้ายเสริมตั้งต้น (แก้/ลบได้)
insert into public.marketing_sku_labels (name, icon, color, description, sort_order, kind) values
  ('ใหม่', '🆕', '#2563eb', 'สินค้าใหม่', 10, 'badge'),
  ('ขายดี', '🔥', '#dc2626', 'ขายดี', 20, 'badge'),
  ('พร้อมส่ง', '📦', '#16a34a', 'มีของพร้อมส่ง', 30, 'badge')
on conflict do nothing;

-- view: เพิ่ม badge_ids (ป้ายเสริมของรุ่น)
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
  greatest(coalesce(v.active, 0) - coalesce(o.off_active, 0), 0) as sku_active,
  coalesce(b.badge_ids, '{}'::uuid[]) as badge_ids
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
left join (
  select parent_sku_id, array_agg(badge_id order by created_at) as badge_ids
  from public.marketing_sku_badge_map
  group by parent_sku_id
) b on b.parent_sku_id = p.id
where p.is_active;

revoke all on public.marketing_sku_overview from anon, authenticated;
grant select on public.marketing_sku_overview to service_role;
