-- Backfill รูปเก่าเข้าคลังกลาง (assets) — ลิงก์ r2_key เดิม ไม่ก๊อปไฟล์ · กันซ้ำด้วย r2_key (idempotent)
-- รวม: SKU cover, Parent cover, product_image_slots, playground attachments, canvas preview, app icons (~90 รูป)
-- ข้าม: Odoo HTML thumbnails (html_media_assets), เอกสาร HR (employee_documents)
-- แท็ก + usage ใส่เฉพาะรูปที่เพิ่งดึง (CTE returning) ไม่แตะ asset เดิม (รูปสินค้า odoo_product หลายพันตัว)

create or replace function public._bf_asset_type(k text) returns text language sql immutable as $$
  select case
    when lower(substring(k from '\.([^.]+)$')) = any(array['jpg','jpeg','png','webp','gif','svg','bmp','heic']) then 'image'
    when lower(substring(k from '\.([^.]+)$')) = any(array['pdf','doc','docx','xls','xlsx','txt']) then 'document'
    else 'other' end
$$;

insert into public.asset_tags (name) values
  ('สินค้า (SKU)'),('สินค้า (Parent)'),('สินค้า (รูปเสริม)'),('ไฟล์แนบเดิม'),('กระดานงาน'),('ไอคอนแอป')
on conflict (name) do nothing;

-- 1) SKU cover
with ins as (
  insert into public.assets (title, file_name, r2_key, asset_type, ext, source, status, created_at)
  select distinct on (s.cover_image_r2_key)
    coalesce(nullif(btrim(coalesce(s.code,'')||' '||coalesce(s.name_th,'')),''), regexp_replace(s.cover_image_r2_key,'^.*/','')),
    regexp_replace(s.cover_image_r2_key,'^.*/',''), s.cover_image_r2_key,
    public._bf_asset_type(s.cover_image_r2_key), lower(substring(s.cover_image_r2_key from '\.([^.]+)$')),
    'upload','active', now()
  from public.skus_v2 s
  where coalesce(s.cover_image_r2_key,'')<>'' and not exists (select 1 from public.assets a where a.r2_key=s.cover_image_r2_key)
  order by s.cover_image_r2_key
  returning id, r2_key
), tg as (
  insert into public.asset_tag_map (asset_id, tag_id)
  select i.id, t.id from ins i cross join public.asset_tags t where t.name='สินค้า (SKU)' on conflict do nothing returning 1
)
insert into public.asset_usages (asset_id, module, record_id, field, record_label)
select distinct on (i.id) i.id, 'product_sku', s.id::text, 'cover_image', s.code
from ins i join public.skus_v2 s on s.cover_image_r2_key = i.r2_key
on conflict (asset_id, module, record_id, field) do nothing;

-- 2) Parent cover
with ins as (
  insert into public.assets (title, file_name, r2_key, asset_type, ext, source, status, created_at)
  select distinct on (p.cover_image_r2_key)
    coalesce(nullif(btrim(coalesce(p.code,'')||' '||coalesce(p.name_th,'')),''), regexp_replace(p.cover_image_r2_key,'^.*/','')),
    regexp_replace(p.cover_image_r2_key,'^.*/',''), p.cover_image_r2_key,
    public._bf_asset_type(p.cover_image_r2_key), lower(substring(p.cover_image_r2_key from '\.([^.]+)$')),
    'upload','active', now()
  from public.parent_skus_v2 p
  where coalesce(p.cover_image_r2_key,'')<>'' and not exists (select 1 from public.assets a where a.r2_key=p.cover_image_r2_key)
  order by p.cover_image_r2_key
  returning id, r2_key
), tg as (
  insert into public.asset_tag_map (asset_id, tag_id)
  select i.id, t.id from ins i cross join public.asset_tags t where t.name='สินค้า (Parent)' on conflict do nothing returning 1
)
insert into public.asset_usages (asset_id, module, record_id, field, record_label)
select distinct on (i.id) i.id, 'parent_sku', p.id::text, 'cover_image', p.code
from ins i join public.parent_skus_v2 p on p.cover_image_r2_key = i.r2_key
on conflict (asset_id, module, record_id, field) do nothing;

-- 3) product_image_slots (รูปเสริมสินค้า)
with ins as (
  insert into public.assets (title, file_name, r2_key, asset_type, ext, content_type, size_bytes, width, height, source, status, created_at)
  select distinct on (ps.r2_key)
    regexp_replace(ps.r2_key,'^.*/',''), regexp_replace(ps.r2_key,'^.*/',''), ps.r2_key,
    public._bf_asset_type(ps.r2_key), lower(substring(ps.r2_key from '\.([^.]+)$')),
    ps.content_type, ps.byte_size, ps.width, ps.height, 'upload','active', ps.created_at
  from public.product_image_slots ps
  where coalesce(ps.r2_key,'')<>'' and not exists (select 1 from public.assets a where a.r2_key=ps.r2_key)
  order by ps.r2_key
  returning id, r2_key
), tg as (
  insert into public.asset_tag_map (asset_id, tag_id)
  select i.id, t.id from ins i cross join public.asset_tags t where t.name='สินค้า (รูปเสริม)' on conflict do nothing returning 1
)
insert into public.asset_usages (asset_id, module, record_id, field, record_label)
select distinct on (i.id) i.id, ps.owner_type, ps.owner_id::text, 'image_slot', null
from ins i join public.product_image_slots ps on ps.r2_key = i.r2_key
on conflict (asset_id, module, record_id, field) do nothing;

-- 4) ไฟล์แนบเดิม (erp_playground_attachments)
with ins as (
  insert into public.assets (title, file_name, r2_key, asset_type, ext, content_type, size_bytes, source, status, uploaded_by, created_at)
  select distinct on (pa.file_path)
    coalesce(nullif(pa.file_name,''), regexp_replace(pa.file_path,'^.*/','')),
    coalesce(nullif(pa.file_name,''), regexp_replace(pa.file_path,'^.*/','')),
    pa.file_path, public._bf_asset_type(pa.file_path), lower(substring(pa.file_path from '\.([^.]+)$')),
    pa.content_type, pa.size_bytes, 'upload','active', pa.uploaded_by, pa.created_at
  from public.erp_playground_attachments pa
  where coalesce(pa.file_path,'')<>'' and not exists (select 1 from public.assets a where a.r2_key=pa.file_path)
  order by pa.file_path
  returning id, r2_key
), tg as (
  insert into public.asset_tag_map (asset_id, tag_id)
  select i.id, t.id from ins i cross join public.asset_tags t where t.name='ไฟล์แนบเดิม' on conflict do nothing returning 1
)
insert into public.asset_usages (asset_id, module, record_id, field, record_label)
select distinct on (i.id) i.id, pa.entity_type, pa.entity_id::text, 'attachment', pa.file_name
from ins i join public.erp_playground_attachments pa on pa.file_path = i.r2_key
on conflict (asset_id, module, record_id, field) do nothing;

-- 5) พรีวิวกระดานงาน (canvas)
with ins as (
  insert into public.assets (title, file_name, r2_key, asset_type, ext, source, status, created_at)
  select distinct on (cs.preview_r2_key)
    'กระดาน '||coalesce(cs.entity_type,''), regexp_replace(cs.preview_r2_key,'^.*/',''), cs.preview_r2_key,
    public._bf_asset_type(cs.preview_r2_key), lower(substring(cs.preview_r2_key from '\.([^.]+)$')),
    'upload','active', cs.created_at
  from public.erp_canvas_sketches cs
  where coalesce(cs.preview_r2_key,'')<>'' and not exists (select 1 from public.assets a where a.r2_key=cs.preview_r2_key)
  order by cs.preview_r2_key
  returning id, r2_key
), tg as (
  insert into public.asset_tag_map (asset_id, tag_id)
  select i.id, t.id from ins i cross join public.asset_tags t where t.name='กระดานงาน' on conflict do nothing returning 1
)
insert into public.asset_usages (asset_id, module, record_id, field, record_label)
select distinct on (i.id) i.id, 'canvas:'||coalesce(cs.entity_type,''), cs.entity_id, 'preview', null
from ins i join public.erp_canvas_sketches cs on cs.preview_r2_key = i.r2_key
on conflict (asset_id, module, record_id, field) do nothing;

-- 6) ไอคอนแอป (erp_app_groups)
with ins as (
  insert into public.assets (title, file_name, r2_key, asset_type, ext, source, status, created_at)
  select distinct on (g.icon_url)
    'ไอคอน '||coalesce(g.label, g.key), regexp_replace(g.icon_url,'^.*/',''), g.icon_url,
    public._bf_asset_type(g.icon_url), lower(substring(g.icon_url from '\.([^.]+)$')),
    'upload','active', now()
  from public.erp_app_groups g
  where coalesce(g.icon_url,'')<>'' and not exists (select 1 from public.assets a where a.r2_key=g.icon_url)
  order by g.icon_url
  returning id, r2_key
), tg as (
  insert into public.asset_tag_map (asset_id, tag_id)
  select i.id, t.id from ins i cross join public.asset_tags t where t.name='ไอคอนแอป' on conflict do nothing returning 1
)
insert into public.asset_usages (asset_id, module, record_id, field, record_label)
select distinct on (i.id) i.id, 'app_group', g.id::text, 'icon', g.label
from ins i join public.erp_app_groups g on g.icon_url = i.r2_key
on conflict (asset_id, module, record_id, field) do nothing;

drop function public._bf_asset_type(text);
