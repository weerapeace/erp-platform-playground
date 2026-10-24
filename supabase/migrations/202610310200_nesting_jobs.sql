-- ============================================================
-- จัดเรียงงานพิมพ์ (Nesting) — เฟส 2 ต่อ ERP (เจ้าของอนุมัติ 2026-10-24)
--
-- ตัวคำนวณ = "ตัวช่วยจัดเรียง" ที่ลงในเครื่องผู้ใช้ (tools/nesting-app) · หน้า ERP คุยกับตัวช่วยที่ 127.0.0.1
-- ตารางนี้เก็บแค่งาน: ค่าตั้งแผ่น + รายการลาย (ลายจากคลัง Artwork / ขนาด / จำนวน) + ผลสรุปล่าสุด
-- ไฟล์ PNG สำหรับพิมพ์ "ลากไฟล์จริงทุกครั้ง" อยู่ในเครื่องที่ลงตัวช่วย (ไม่เก็บใน ERP ตามที่เจ้าของเลือก)
--   → items เก็บชื่อไฟล์ + รหัส sha ไว้จับคู่ตอนเปิดงานซ้ำ
-- ============================================================

create table public.erp_nesting_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'done', 'printed')),
  print_type_id uuid references public.erp_print_types(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,   -- แผ่น/ระยะห่าง/ขอบ/การหมุน/โหมดเติม/เรียงแถว/หัวงาน (เหมือนหน้าตัวช่วย)
  items jsonb not null default '[]'::jsonb,      -- [{asset_id,title,size:{mode,value},qty,fill_pct,file:{name,sha}}]
  result jsonb,                                  -- ผลล่าสุด {used_length_mm,sheets,placed,total,utilization,filled}
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true        -- ลบ = ซ่อน (กู้คืนได้)
);

create index erp_nesting_jobs_active_updated on public.erp_nesting_jobs (is_active, updated_at desc);

-- ไม่มี policy = อ่าน/เขียนตรงไม่ได้ · เข้าผ่าน /api/nesting-jobs (guardApi + supabaseAdmin) เท่านั้น
alter table public.erp_nesting_jobs enable row level security;
revoke all on table public.erp_nesting_jobs from anon;

-- สิทธิ์ (admin มีทุกสิทธิ์อยู่แล้ว · ตำแหน่งอื่นไปติ๊กเพิ่มที่ /admin/roles-permissions)
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('nesting.view',   'ดูงานจัดเรียงงานพิมพ์',          'tasks', 'เปิดหน้าจัดเรียงงานพิมพ์และดูงานที่บันทึกไว้', false, 50),
  ('nesting.run',    'สร้าง / แก้ / จัดเรียงงานพิมพ์',  'tasks', 'สร้างงาน แก้ค่าตั้ง สั่งจัดเรียง และบันทึกผล', false, 51),
  ('nesting.delete', 'ลบงานจัดเรียงงานพิมพ์',          'tasks', 'ซ่อนงานจัดเรียงออกจากรายการ', true, 52)
on conflict (key) do nothing;

-- ทะเบียนโมดูล (ให้โผล่ใน "โมดูลทั้งหมด")
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'erp_nesting_jobs', 'erp_nesting_jobs', 'จัดเรียงงานพิมพ์',
       'งานจัดเรียงภาพลงแผ่นพิมพ์ตามเส้นขอบจริง (คำนวณด้วยตัวช่วยในเครื่อง)', 'name', 'physical',
       '{"icon": "✂️", "api_path": "/api/nesting-jobs", "page_href": "/tasks/nesting", "entity_type": "erp_nesting_jobs"}'::jsonb,
       true, 180, 'งาน (Tasks)'
where not exists (select 1 from public.erp_modules where module_key = 'erp_nesting_jobs');

-- เมนูในแอป "จัดการงาน" ต่อจาก ปฏิทินคอนเทนต์
insert into public.erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher,
                                   permission_key, is_active, app_keys, module_key)
values ('📋 จัดการงาน', 15, 13, '✂️', 'จัดเรียงงานพิมพ์', '/tasks/nesting', true, true,
        'nesting.view', true, array['tasks'], 'erp_nesting_jobs')
on conflict (href) do nothing;
