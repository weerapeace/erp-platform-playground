-- 🧵 ไฟล์ปัก (Embroidery) — เปิดโลโก้ .ai/.pdf/.svg → ตั้งชนิดฝีเข็มตามสี + ขนาดจริง → ดูตัวอย่างฝีเข็ม → ดาวน์โหลด .DST ส่งร้านปัก
--
-- เจ้าของสั่ง 2026-11-26 (widget: ทาง A+B · ร้านไม่แน่ใจ = .DST ก่อน · ปักผ้า · ทีมออกแบบ+เจ้าของ · ข้อเสนอ 1 เตือนเส้นบาง, 2 ใบสั่งปัก, 3 ผูก Parent SKU)
-- embroidery_designs = งานปัก 1 งาน = ลาย 1 ไฟล์ + ค่าตั้ง · ไฟล์ .DST สร้างใหม่ในเบราว์เซอร์ทุกครั้ง (ไม่เก็บไฟล์)
--   pieces jsonb   = ชิ้นเวกเตอร์ + สีพื้น (รูปแบบเดียวกับบล็อกพิมพ์ · ตรวจด้วย cleanPieces ใน lib/block-print.ts)
--   settings jsonb = ขนาด/ความแน่น/ชนิดฝีเข็มตามสี (ตรวจด้วย cleanSettings ใน lib/embroidery.ts)
--   stitch_count/color_count/width_mm/height_mm = ผลล่าสุด ไว้โชว์หน้ารายการ (หน้าเว็บคำนวณแล้วส่งมา)
--   parent_sku_id = ผูกกับสินค้า (ข้อเสนอ 3) · ลบสินค้า = ตัดลิงก์ (set null) ไม่ลบงานปัก
--   ลบ = เก็บไว้ก่อน (is_active=false + deleted_at) กู้คืนได้ที่ถังขยะในหน้า /master/embroidery
-- RLS: เปิด ไม่มี policy = เข้าได้เฉพาะ service role ผ่าน API (/api/embroidery/designs — guardApi + audit)

create sequence if not exists public.embroidery_designs_seq;

create table if not exists public.embroidery_designs (
  id                uuid primary key default gen_random_uuid(),
  code              text not null default ('EMB-' || lpad(nextval('public.embroidery_designs_seq')::text, 4, '0')),
  name              text not null,
  note              text,
  source_file_name  text,
  parent_sku_id     uuid references public.parent_skus_v2(id) on delete set null,
  pieces            jsonb not null default '[]'::jsonb check (jsonb_typeof(pieces) = 'array'),
  settings          jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  stitch_count      integer not null default 0,
  color_count       integer not null default 0,
  width_mm          numeric(8,2),
  height_mm         numeric(8,2),
  is_active         boolean not null default true,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists embroidery_designs_code_uq on public.embroidery_designs (code);
create index if not exists embroidery_designs_active_idx on public.embroidery_designs (is_active, updated_at desc);
create index if not exists embroidery_designs_parent_idx on public.embroidery_designs (parent_sku_id) where parent_sku_id is not null;
comment on table public.embroidery_designs is 'ไฟล์ปัก: ลายเวกเตอร์ + ค่าตั้งฝีเข็ม → .DST (สร้างในเบราว์เซอร์) · lib/embroidery.ts';

alter table public.embroidery_designs enable row level security;

-- ─── สิทธิ์ ──────────────────────────────────────────────────────────────────
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('embroidery.view', 'ดูงานไฟล์ปัก',        'ออกแบบ', 'เปิดดูงานไฟล์ปัก ตัวอย่างฝีเข็ม ดาวน์โหลด .DST และพิมพ์ใบสั่งปัก', false, 2460),
  ('embroidery.edit', 'สร้าง/แก้งานไฟล์ปัก', 'ออกแบบ', 'เปิดไฟล์โลโก้สร้างงานใหม่ ตั้งค่าฝีเข็ม บันทึก และลบงาน (ลบแบบกู้คืนได้)', false, 2470)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'embroidery.view'), ('manager', 'embroidery.view'), ('staff', 'embroidery.view'),
  ('admin', 'embroidery.edit'), ('manager', 'embroidery.edit'), ('staff', 'embroidery.edit')
on conflict do nothing;

-- ─── เมนู: แอปออกแบบ + แอปผลิต หมวด "🎨 ออกแบบสินค้า" (ถัดจากบล็อกพิมพ์) ───
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher, app_overrides)
select '/master/embroidery', '🧵', 'ไฟล์ปัก', '🎨 ออกแบบสินค้า', array['design', 'production'], 15, 35, 'embroidery.view', true, true, true, '{}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/master/embroidery');

-- ─── ทะเบียนโมดูล (โผล่ใน "โมดูลทั้งหมด") ────────────────────────────────────
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'embroidery_designs', 'embroidery_designs', 'ไฟล์ปัก', 'งานไฟล์ปักจากโลโก้เวกเตอร์ → .DST (หน้าจริง /master/embroidery)', 'name', 'physical',
       '{"api_path":"/api/embroidery/designs","entity_type":"embroidery_designs","icon":"🧵","page_href":"/master/embroidery"}'::jsonb, true, 976, 'ออกแบบ'
where not exists (select 1 from public.erp_modules where module_key = 'embroidery_designs');
