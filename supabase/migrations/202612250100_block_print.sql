-- 🧱 บล็อกพิมพ์ (Block Print) — เปิดไฟล์ .ai → เลือกชิ้นเวกเตอร์ → ตั้งขนาดจริง → PDF (ลาย + เส้นบอกขนาด) ส่งโรงงานทำบล็อก
--
-- เจ้าของสั่ง 2026-11-24 (ดู widget 3 รอบ แล้ว "เริ่มรอบ 1") · คู่มือ docs/block-print.md
-- block_print_jobs = งานบล็อก 1 งาน = ไฟล์ .ai 1 ไฟล์ + ชิ้นที่แยกได้ + ขนาดที่ตั้ง
--   pieces jsonb = [{id,name,d (เส้นแบบ pdf.js DrawOPS หน่วย มม.),fill,ow,oh,w,h,ax,ay,on}] — ตรวจด้วย cleanPieces (lib/block-print.ts)
--   code ออกเลขเองจาก sequence (BLK-0001) — ไม่ชนกันแม้สร้างพร้อมกัน
--   ลบ = ลบแบบเก็บไว้ก่อน (is_active=false + deleted_at) กู้คืนได้ที่หน้า "โมดูลทั้งหมด"
--   ไฟล์ .ai/PDF จริงยังไม่เก็บในรอบ 1 (รอบ 3 = เก็บขึ้น Google Drive ตามกฎไฟล์งานพิมพ์)
-- RLS: เปิด ไม่มี policy = เข้าได้เฉพาะ service role ผ่าน API (/api/block-print/jobs — guardApi + audit)

create sequence if not exists public.block_print_jobs_seq;

create table if not exists public.block_print_jobs (
  id                uuid primary key default gen_random_uuid(),
  code              text not null default ('BLK-' || lpad(nextval('public.block_print_jobs_seq')::text, 4, '0')),
  name              text not null,
  note              text,
  source_file_name  text,
  unit              text not null default 'cm' check (unit in ('cm', 'mm')),
  paper             text not null default 'A4' check (paper in ('A4', 'A3')),
  pieces            jsonb not null default '[]'::jsonb check (jsonb_typeof(pieces) = 'array'),
  -- นับชิ้นไว้ให้หน้ารายการ (ไม่ต้องดึงเส้นทั้งก้อน)
  piece_count       integer generated always as (jsonb_array_length(pieces)) stored,
  piece_on          integer generated always as (jsonb_array_length(jsonb_path_query_array(pieces, '$[*] ? (!(@.on == false))'))) stored,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists block_print_jobs_code_uq on public.block_print_jobs (code);
create index if not exists block_print_jobs_active_idx on public.block_print_jobs (is_active, updated_at desc);
comment on table public.block_print_jobs is 'บล็อกพิมพ์: งาน 1 ไฟล์ .ai → ชิ้นเวกเตอร์ + ขนาดจริง → PDF ส่งโรงงาน · lib/block-print.ts';

alter table public.block_print_jobs enable row level security;

-- ─── สิทธิ์ ──────────────────────────────────────────────────────────────────
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('block_print.view', 'ดูงานบล็อกพิมพ์',        'ออกแบบ', 'เปิดดูงานบล็อกพิมพ์ และดาวน์โหลด PDF ที่ส่งโรงงาน', false, 2440),
  ('block_print.edit', 'สร้าง/แก้งานบล็อกพิมพ์', 'ออกแบบ', 'เปิดไฟล์ .ai สร้างงานใหม่ ตั้งขนาดชิ้น บันทึก และลบงาน (ลบแบบกู้คืนได้)', false, 2450)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'block_print.view'), ('manager', 'block_print.view'), ('staff', 'block_print.view'),
  ('admin', 'block_print.edit'), ('manager', 'block_print.edit'), ('staff', 'block_print.edit')
on conflict do nothing;

-- ─── เมนู: แอปออกแบบ + แอปผลิต หมวด "🎨 ออกแบบสินค้า" ───────────────────────
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher, app_overrides)
select '/master/block-print', '🧱', 'บล็อกพิมพ์', '🎨 ออกแบบสินค้า', array['design', 'production'], 14, 35, 'block_print.view', true, true, true, '{}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/master/block-print');

-- ─── ทะเบียนโมดูล (โผล่ใน "โมดูลทั้งหมด" — กู้คืนงานที่ลบได้ที่นั่น) ─────────
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'block_print_jobs', 'block_print_jobs', 'บล็อกพิมพ์', 'งานบล็อกพิมพ์จากไฟล์ .ai (หน้าจริง /master/block-print)', 'name', 'physical',
       '{"api_path":"/api/block-print/jobs","entity_type":"block_print_jobs","icon":"🧱","page_href":"/master/block-print"}'::jsonb, true, 975, 'ออกแบบ'
where not exists (select 1 from public.erp_modules where module_key = 'block_print_jobs');
