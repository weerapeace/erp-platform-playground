-- สตูดิโอแพทเทิร์น = แอปหลัก (เจ้าของสั่ง 2026-11-10 "ย้าย APP นี้เป็น app หลัก" · อนุญาตเพิ่มฐานข้อมูลแล้ว)
--   แพทเทิร์นแต่ละใบเก็บเป็นของตัวเอง: ชิ้นบนกระดาน (pieces) + ตะเข็บ (seams) — ไม่ผูกกับบรรทัดตีราคาของใบงานออกแบบ
--   เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (เปิด RLS ไม่ตั้ง policy = anon/authenticated อ่านตรงไม่ได้)
--   ไม่แตะตารางเดิม

-- 1) แพทเทิร์น
create table public.pattern_projects (
  id              uuid primary key default gen_random_uuid(),
  pattern_no      text unique,                              -- PAT-YYYYMM-0001
  name            text not null,
  status          text not null default 'draft' check (status in ('draft','ready','archived')),
  note            text not null default '',
  sku_code        text,                                     -- รหัสรุ่น/สินค้าที่เกี่ยว (พิมพ์เอง)
  pieces          jsonb not null default '[]'::jsonb,       -- [{pid,name,count,allow,shape,holes,grain,notches,at}] รูปทรงแบบ lib/pattern-shape
  seams           jsonb not null default '[]'::jsonb,       -- [{id,a:{pid,from,count,n},b:{…}}] lib/pattern-seams
  basis           text not null default 'box' check (basis in ('box','area')),
  template        jsonb,                                    -- ค่าแม่แบบทรงที่ใช้ล่าสุด (ไว้เปิดตัวสร้างด้วยค่าเดิม)
  piece_count     int not null default 0,                   -- สรุปไว้ให้หน้ารายการ (ไม่ต้องอ่านทั้งก้อน)
  seam_count      int not null default 0,
  area_cm2        numeric not null default 0,
  thumb           text,                                     -- ภาพย่อ "กว้าง สูง|path" (เส้นตัดทุกชิ้น)
  owner_id        uuid,
  owner_name      text,
  updated_by_name text,
  is_active       boolean not null default true,            -- ลบ = ซ่อน (กู้คืนได้)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pattern_projects_list_idx on public.pattern_projects (is_active, updated_at desc);
alter table public.pattern_projects enable row level security;

-- 2) เลขแพทเทิร์น PAT-YYYYMM-0001 (ของกลาง erp_next_number)
insert into public.erp_numbering_rules (key, label, pattern, reset_policy, current_value, active, notes)
values ('pattern_project', 'แพทเทิร์น (สตูดิโอแพทเทิร์น)', 'PAT-{YYYYMM}-{0000}', 'monthly', 0, true, 'แอป /pattern-studio')
on conflict (key) do nothing;

-- 3) สิทธิ์ (ชื่อขึ้นต้น pattern_studio. — ไม่ปนกับ pattern.* ของตั๋วงานช่าง Pattern)
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
 ('pattern_studio.view',   'ดูแพทเทิร์น (สตูดิโอแพทเทิร์น)',   'production', 'เปิดแอปสตูดิโอแพทเทิร์น ดูแพทเทิร์นและภาพ 3D',            false, 410),
 ('pattern_studio.edit',   'สร้าง/แก้แพทเทิร์น',               'production', 'สร้างแพทเทิร์นใหม่ วาดชิ้น กำหนดตะเข็บ บันทึก',           false, 411),
 ('pattern_studio.delete', 'ลบแพทเทิร์น',                      'production', 'ลบแพทเทิร์น (ซ่อนจากรายการ กู้คืนได้โดยผู้ดูแลระบบ)',      true,  412)
on conflict (key) do nothing;

-- เจ้าของเลือก 2026-11-10: ผู้ดูแลระบบ + ผู้จัดการ = ดู/แก้/ลบ · ฝ่ายออกแบบ = ดู/แก้ · พนักงานทั่วไปยังไม่เห็น
insert into public.erp_role_permissions (role_key, permission_key) values
 ('admin','pattern_studio.view'),    ('admin','pattern_studio.edit'),    ('admin','pattern_studio.delete'),
 ('manager','pattern_studio.view'),  ('manager','pattern_studio.edit'),  ('manager','pattern_studio.delete'),
 ('designer','pattern_studio.view'), ('designer','pattern_studio.edit')
on conflict do nothing;

-- 4) แอปใหม่ในหน้ารวมแอป (เห็นเฉพาะคนที่มี pattern_studio.view)
insert into public.erp_app_groups (key, label, icon, sort_order, permission_key, default_href, is_active)
select 'pattern-studio', 'สตูดิโอแพทเทิร์น', '👜', 85, 'pattern_studio.view', '/pattern-studio', true
where not exists (select 1 from public.erp_app_groups where key = 'pattern-studio');

-- 5) เมนู: แอปใหม่ + แอปออกแบบ
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher, app_overrides)
select '/pattern-studio', '👜', 'สตูดิโอแพทเทิร์น', '🎨 ออกแบบสินค้า', array['pattern-studio','design'], 12, 35, 'pattern_studio.view', true, true, true, '{}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/pattern-studio');

-- 6) ทะเบียนโมดูล (โผล่ในหน้า "โมดูลทั้งหมด")
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'pattern_projects', 'pattern_projects', 'แพทเทิร์น (สตูดิโอแพทเทิร์น)', 'แพทเทิร์นกระเป๋า: ชิ้น + ตะเข็บ + ภาพ 3D — หน้าเฉพาะทาง /pattern-studio',
       'pattern_no', 'physical', '{"icon":"👜","entity_type":"pattern_projects","page":"/pattern-studio"}'::jsonb, true, 211, 'เอกสาร'
where not exists (select 1 from public.erp_modules where module_key = 'pattern_projects');
