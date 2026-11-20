-- หน่วยนับ 2 ภาษา + รวมหน่วยซ้ำ (เจ้าของสั่ง 2026-11-20: "หลา กับ Yard ซ้ำ ต้องเป็น ไทย = english")
--
-- ทำไมต้องเพิ่มช่อง: ตาราง uoms มีชื่อได้ช่องเดียว (name) → หลา กับ Yard เลยต้องเป็น 2 แถว
--   name      = ชื่อหลักที่ระบบใช้จับคู่ (ไม่เปลี่ยน — เอกสาร ~30 ตาราง เก็บชื่อหน่วยเป็นข้อความ และโค้ดเทียบ "หลา"/"ชิ้น" ตรง ๆ)
--   name_th / name_en = ชื่อไทย · อังกฤษ ที่โชว์ (display_name ตั้งให้อัตโนมัติ = "หลา · Yard")
--   aliases   = ชื่ออื่นของหน่วยนี้ (คั่นด้วย ,) เช่น Yard, yd — ค้นเจอ + เอกสารเก่าที่เขียนชื่อเก่ายังรู้ว่าเป็นหน่วยไหน
--   merged_into = หน่วยที่ถูกรวมแล้ว ชี้ไปตัวหลัก (ตัวรอง active=false = อยู่ในถังขยะ กู้คืนได้)
-- รวมหน่วย = ฟังก์ชัน uom_merge (ย้าย SKU/ประเภทแท็กที่ใช้ตัวรอง → ตัวหลัก ในครั้งเดียว) · ย้อนกลับ = uom_merge_undo
-- เรียกได้เฉพาะ service role (API /api/master/uoms/merge เช็กสิทธิ์ products.edit + ลง audit)

alter table public.uoms add column if not exists name_th text;
alter table public.uoms add column if not exists name_en text;
alter table public.uoms add column if not exists aliases text;
alter table public.uoms add column if not exists merged_into uuid references public.uoms(id);

create or replace function public.uoms_set_display_name() returns trigger
language plpgsql set search_path = public as $$
declare th text := nullif(btrim(coalesce(new.name_th, '')), ''); en text := nullif(btrim(coalesce(new.name_en, '')), '');
begin
  new.display_name := case
    when th is not null and en is not null and lower(th) <> lower(en) then th || ' · ' || en
    else coalesce(th, en, new.name) end;
  return new;
end $$;

drop trigger if exists trg_uoms_set_display_name on public.uoms;
create trigger trg_uoms_set_display_name before insert or update of name, name_th, name_en on public.uoms
  for each row execute function public.uoms_set_display_name();

-- เติมชื่อไทย · อังกฤษ ให้ 24 หน่วยเดิม (อ้างด้วย odoo_id — คงที่) · แก้ทีหลังได้ในหน้าจัดการหน่วย
update public.uoms u set name_th = v.th, name_en = v.en, aliases = coalesce(u.aliases, v.al)
from (values
  (30, 'หลา', 'Yard', 'yd'),        (29, 'หลา', 'Yard', null),
  (1,  'ชิ้น', 'Pcs', null),         (36, 'ชิ้น', 'Pcs', null),        (41, 'ชิ้น', 'Pcs', null),
  (8,  'เมตร', 'm', 'meter'),       (39, 'เซนติเมตร', 'cm', 'cm., ซม.'), (6, 'มิลลิเมตร', 'mm', null),
  (9,  'กิโลเมตร', 'km', null),     (32, 'ตร.ซม.', 'cm²', 'cm2'),     (10, 'ตร.ม.', 'm²', 'm2'),
  (34, 'ตร.ฟุต', 'ft²', 'ft2'),     (15, 'กิโลกรัม', 'kg', null),     (14, 'กรัม', 'g', null),
  (33, 'ขีด', '100 g', null),       (16, 'ตัน', 'Ton', null),         (12, 'ลิตร', 'L', null),
  (11, 'มิลลิลิตร', 'ml', null),    (4,  'ชั่วโมง', 'Hours', null),   (5, 'วัน', 'Days', null),
  (2,  'แพ็ค 6', 'Pack of 6', null), (31, 'คู่', 'Pair', null),       (40, 'ด้าม', 'Stick', null),
  (35, 'ม้วน', 'Roll', null)
) as v(oid, th, en, al)
where u.odoo_id = v.oid and u.name_th is null;
update public.uoms set display_name = display_name where name_th is null;   -- แถวที่ไม่อยู่ในรายการ → display_name = name

-- หน่วยที่มีพิมพ์ในเอกสารแต่ยังไม่อยู่ในทะเบียน (ผืน 28 · แผ่น 45 · set 1 บรรทัด)
insert into public.uoms (name, name_th, name_en, aliases, active, sync_status)
select v.n, v.th, v.en, v.al, true, 'skipped'
from (values ('ผืน', 'ผืน', 'Panel', null), ('แผ่น', 'แผ่น', 'Sheet', null), ('ชุด', 'ชุด', 'Set', 'set')) as v(n, th, en, al)
where not exists (select 1 from public.uoms u where lower(u.name) = lower(v.n) or lower(coalesce(u.name_th, '')) = lower(v.th));

-- ── บันทึกการรวมหน่วย (ไว้ย้อนกลับ) ─────────────────────────────────────────
create table if not exists public.uom_merges (
  id uuid primary key default gen_random_uuid(),
  primary_id uuid not null references public.uoms(id),
  secondary_id uuid not null references public.uoms(id),
  moved jsonb not null default '{}'::jsonb,
  primary_before jsonb,
  actor_id uuid,
  actor_name text,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by text
);
alter table public.uom_merges enable row level security;
revoke all on public.uom_merges from anon, authenticated;

create or replace function public.uom_merge(p_primary uuid, p_secondary uuid, p_actor_id uuid default null, p_actor_name text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  pri public.uoms%rowtype; sec public.uoms%rowtype;
  v2_uom uuid[]; v2_puom uuid[]; ps_uom uuid[]; ps_puom uuid[]; fam_def uuid[]; fam_pre jsonb;
  new_alias text; mid uuid;
begin
  if p_primary = p_secondary then raise exception 'เลือกหน่วยเดียวกัน รวมไม่ได้'; end if;
  select * into pri from public.uoms where id = p_primary for update;
  select * into sec from public.uoms where id = p_secondary for update;
  if pri.id is null or sec.id is null then raise exception 'ไม่พบหน่วย'; end if;
  if not pri.active then raise exception 'หน่วยหลักอยู่ในถังขยะ'; end if;
  if not sec.active then raise exception 'หน่วยที่จะรวมอยู่ในถังขยะแล้ว'; end if;

  select coalesce(array_agg(id), '{}') into v2_uom  from public.skus_v2 where uom_id = p_secondary;
  select coalesce(array_agg(id), '{}') into v2_puom from public.skus_v2 where purchase_uom_id = p_secondary;
  select coalesce(array_agg(id), '{}') into ps_uom  from public.product_skus where uom_id = p_secondary;
  select coalesce(array_agg(id), '{}') into ps_puom from public.product_skus where purchase_uom_id = p_secondary;
  select coalesce(array_agg(id), '{}') into fam_def from public.product_families where default_uom_id = p_secondary;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'prefix_defaults', prefix_defaults)), '[]'::jsonb) into fam_pre
    from public.product_families where prefix_defaults::text like '%' || p_secondary::text || '%';

  update public.skus_v2 set uom_id = p_primary where id = any(v2_uom);
  update public.skus_v2 set purchase_uom_id = p_primary where id = any(v2_puom);
  update public.product_skus set uom_id = p_primary, uom_name = pri.name, uom_odoo_id = pri.odoo_id where id = any(ps_uom);
  update public.product_skus set purchase_uom_id = p_primary, purchase_uom_name = pri.name, purchase_uom_odoo_id = pri.odoo_id where id = any(ps_puom);
  update public.product_families set default_uom_id = p_primary where id = any(fam_def);
  update public.product_families set prefix_defaults = replace(prefix_defaults::text, p_secondary::text, p_primary::text)::jsonb
    where prefix_defaults::text like '%' || p_secondary::text || '%';

  -- ชื่อเดิมของตัวรอง (+ชื่ออื่นของมัน) → เป็นชื่ออื่นของตัวหลัก
  select string_agg(distinct a, ', ') into new_alias from (
    select btrim(x) a from unnest(string_to_array(coalesce(pri.aliases, '') || ',' || sec.name || ',' || coalesce(sec.aliases, ''), ',')) x
  ) t where a <> '' and lower(a) <> lower(pri.name) and lower(a) <> lower(coalesce(pri.name_th, '')) and lower(a) <> lower(coalesce(pri.name_en, ''));
  update public.uoms set aliases = new_alias, updated_at = now() where id = p_primary;
  update public.uoms set active = false, merged_into = p_primary, updated_at = now() where id = p_secondary;

  insert into public.uom_merges (primary_id, secondary_id, moved, primary_before, actor_id, actor_name)
  values (p_primary, p_secondary,
    jsonb_build_object('skus_v2_uom', to_jsonb(v2_uom), 'skus_v2_purchase_uom', to_jsonb(v2_puom),
      'product_skus_uom', to_jsonb(ps_uom), 'product_skus_purchase_uom', to_jsonb(ps_puom),
      'families_default', to_jsonb(fam_def), 'families_prefix', fam_pre,
      'secondary_name', sec.name, 'secondary_odoo_id', sec.odoo_id),
    jsonb_build_object('aliases', pri.aliases), p_actor_id, p_actor_name)
  returning id into mid;
  return mid;
end $$;

create or replace function public.uom_merge_undo(p_merge_id uuid, p_actor_name text default null)
returns void language plpgsql set search_path = public as $$
declare m public.uom_merges%rowtype; f jsonb; sname text; soid bigint;
begin
  select * into m from public.uom_merges where id = p_merge_id for update;
  if m.id is null then raise exception 'ไม่พบประวัติการรวม'; end if;
  if m.undone_at is not null then raise exception 'ย้อนกลับไปแล้ว'; end if;
  sname := m.moved->>'secondary_name'; soid := nullif(m.moved->>'secondary_odoo_id', '')::bigint;

  -- คืนเฉพาะแถวที่ยังชี้ตัวหลักอยู่ (ถ้ามีคนเปลี่ยนหน่วยไปแล้วหลังรวม = ไม่ทับ)
  update public.skus_v2 set uom_id = m.secondary_id
    where uom_id = m.primary_id and id in (select (jsonb_array_elements_text(m.moved->'skus_v2_uom'))::uuid);
  update public.skus_v2 set purchase_uom_id = m.secondary_id
    where purchase_uom_id = m.primary_id and id in (select (jsonb_array_elements_text(m.moved->'skus_v2_purchase_uom'))::uuid);
  update public.product_skus set uom_id = m.secondary_id, uom_name = sname, uom_odoo_id = soid
    where uom_id = m.primary_id and id in (select (jsonb_array_elements_text(m.moved->'product_skus_uom'))::uuid);
  update public.product_skus set purchase_uom_id = m.secondary_id, purchase_uom_name = sname, purchase_uom_odoo_id = soid
    where purchase_uom_id = m.primary_id and id in (select (jsonb_array_elements_text(m.moved->'product_skus_purchase_uom'))::uuid);
  update public.product_families set default_uom_id = m.secondary_id
    where default_uom_id = m.primary_id and id in (select (jsonb_array_elements_text(m.moved->'families_default'))::uuid);
  for f in select * from jsonb_array_elements(coalesce(m.moved->'families_prefix', '[]'::jsonb)) loop
    update public.product_families set prefix_defaults = f->'prefix_defaults' where id = (f->>'id')::uuid;
  end loop;

  update public.uoms set aliases = m.primary_before->>'aliases', updated_at = now() where id = m.primary_id;
  update public.uoms set active = true, merged_into = null, updated_at = now() where id = m.secondary_id;
  update public.uom_merges set undone_at = now(), undone_by = p_actor_name where id = p_merge_id;
end $$;

revoke all on function public.uom_merge(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.uom_merge_undo(uuid, text) from public, anon, authenticated;
grant execute on function public.uom_merge(uuid, uuid, uuid, text) to service_role;
grant execute on function public.uom_merge_undo(uuid, text) to service_role;

-- ทะเบียน field ของหน้าหน่วย: ชื่อไทย / อังกฤษ / ชื่ออื่น · ชื่อแสดงตั้งอัตโนมัติ (ไม่ต้องกรอก)
insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key,
  is_visible, is_required, is_editable, is_filterable, is_sortable, display_order, is_active, show_in_form, help_text)
select m.id, v.k, v.k, v.lbl, v.en, 'text', 'text', 'physical', 'core', true, false, true, true, true, v.ord, true, true, v.help
from public.erp_modules m
cross join (values
  ('name_th', 'ชื่อไทย', 'Thai name', 12, 'เช่น หลา · เมตร · ชิ้น'),
  ('name_en', 'ชื่ออังกฤษ', 'English name', 14, 'เช่น Yard · m · Pcs'),
  ('aliases', 'ชื่ออื่น', 'Other names', 16, 'ชื่อเรียกอื่นของหน่วยนี้ คั่นด้วย , เช่น yd, Yard — ค้นเจอ และกันสร้างหน่วยซ้ำ')
) as v(k, lbl, en, ord, help)
where m.module_key = 'uoms'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.k);
update public.erp_module_fields f set show_in_form = false, is_editable = false, field_label = 'ชื่อที่โชว์ (อัตโนมัติ)'
from public.erp_modules m where f.module_id = m.id and m.module_key = 'uoms' and f.column_name = 'display_name';
update public.erp_module_fields f set help_text = 'ชื่อหลักที่ระบบใช้จับคู่กับเอกสาร — ปกติใช้ชื่อไทย'
from public.erp_modules m where f.module_id = m.id and m.module_key = 'uoms' and f.column_name = 'name';

-- จำนวนที่ใช้แต่ละหน่วย (สินค้า + ประเภทแท็ก) — โชว์ในป๊อปรวมหน่วย
create or replace function public.uom_usage_counts()
returns table (uom_id uuid, skus bigint, purchase_skus bigint, families bigint)
language sql stable set search_path = public as $$
  select u.id,
    (select count(*) from public.skus_v2 s where s.uom_id = u.id),
    (select count(*) from public.skus_v2 s where s.purchase_uom_id = u.id),
    (select count(*) from public.product_families f where f.default_uom_id = u.id or f.prefix_defaults::text like '%' || u.id::text || '%')
  from public.uoms u;
$$;
revoke all on function public.uom_usage_counts() from public, anon, authenticated;
grant execute on function public.uom_usage_counts() to service_role;
