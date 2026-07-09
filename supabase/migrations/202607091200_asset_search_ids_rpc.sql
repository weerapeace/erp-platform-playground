-- หา asset ids ที่ token ตรงกับ Parent SKU / ชนิด artwork (jsonb array) หรือ แท็ก (m2m)
-- ใช้เสริมการค้นหาในคลังไฟล์ (นอกเหนือจาก title/file_name/description/keywords)
create or replace function search_asset_ids(tok text)
returns table(asset_id uuid)
language sql
stable
as $$
  select a.id
  from assets a
  where exists (
    select 1 from jsonb_array_elements_text(coalesce(a.parent_sku_codes, '[]'::jsonb)) e(v)
    where e.v ilike '%' || tok || '%'
  ) or exists (
    select 1 from jsonb_array_elements_text(coalesce(a.artwork_types, '[]'::jsonb)) e(v)
    where e.v ilike '%' || tok || '%'
  )
  union
  select m.asset_id
  from asset_tag_map m
  join asset_tags t on t.id = m.tag_id
  where t.name ilike '%' || tok || '%';
$$;
