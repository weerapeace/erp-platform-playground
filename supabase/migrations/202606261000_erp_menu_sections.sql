-- หมวดเมนู (ต่อแอป) สำหรับไอคอน + ลำดับหมวด — ใช้ทั้ง /admin/menu และเมนูซ้ายจริง
-- จับคู่กับ erp_menu_items.section ด้วย (app_key, name)
create table if not exists public.erp_menu_sections (
  id uuid primary key default gen_random_uuid(),
  app_key text not null,
  name text not null,
  icon text,
  icon_url text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_key, name)
);

alter table public.erp_menu_sections enable row level security;

drop policy if exists menu_sections_sel on public.erp_menu_sections;
create policy menu_sections_sel on public.erp_menu_sections for select to authenticated using (true);

-- backfill: หนึ่งแถวต่อ (แอป, ชื่อหมวด) + sort_order = section_order น้อยสุดของหมวดนั้นในแอป
insert into public.erp_menu_sections (app_key, name, sort_order)
select unnest(app_keys) as app_key, section, min(section_order)
from public.erp_menu_items
where section is not null and section <> '' and coalesce(array_length(app_keys,1),0) > 0
group by 1, section
on conflict (app_key, name) do nothing;
