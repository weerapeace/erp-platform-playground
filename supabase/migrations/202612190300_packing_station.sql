-- ระบบแพ็คสินค้า (Packing Station) ช่วงทดลอง — docs/packing-station.md §5 / §13
-- เจ้าของอนุมัติ 2026-11-17 (เลือก "เก็บคลิปในเครื่องโต๊ะแพ็ค" = ไฟเขียวเริ่มทำ)
-- เพิ่มอย่างเดียว ไม่แก้/ลบข้อมูลเดิม · ไม่ตัดสต๊อก ไม่ส่งอะไรไปร้านค้า

-- 1) บันทึกการแพ็ค 1 ครั้ง (1 แถว = แพ็ค 1 ออเดอร์ 1 รอบ)
create table if not exists public.packing_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.platform_orders(id) on delete cascade,
  scanned_code text,                         -- รหัสที่ยิงมาเปิดออเดอร์ (เลขพัสดุ/เลขออเดอร์/เลขแพ็กเกจ)
  packer_id uuid,                            -- คนแพ็ค (user_profiles.id)
  packer_name text,
  station text,                              -- ชื่อสถานี/โต๊ะ (ตั้งในเครื่อง)
  status text not null default 'packing' check (status in ('packing','done','problem','abandoned')),
  started_at timestamptz not null default now(),
  checked_at timestamptz,                    -- เช็กของครบเมื่อ
  finished_at timestamptz,
  duration_sec integer,                      -- เริ่ม → จบ (วินาที)
  box_suggested text,                        -- กล่องที่ระบบแนะนำ (ชื่อจาก parcel_sizes)
  box_used text,                             -- กล่องที่ใช้จริง
  checks jsonb not null default '{}'::jsonb, -- ผลเช็กของ: ยิงถูก/ผิด/เกิน · ติ๊กมือ + เหตุผล
  problem text,                              -- missing / wrong / damaged / other
  problem_note text,
  finish_method text,                        -- next_label / card / pedal / button
  clip jsonb,                                -- ข้อมูลคลิป: ที่เก็บ (local = ในเครื่องโต๊ะแพ็ค) · ขนาด · ความยาว · ชนิดไฟล์ · SHA-256
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_packing_sessions_order on public.packing_sessions(order_id);
create index if not exists idx_packing_sessions_started on public.packing_sessions(started_at desc);
create index if not exists idx_packing_sessions_packer on public.packing_sessions(packer_id, started_at desc);

-- อ่าน/เขียนผ่าน API ที่เช็กสิทธิ์เท่านั้น (เหมือนตารางออเดอร์ · คลิปเห็นที่อยู่ลูกค้า)
alter table public.packing_sessions enable row level security;
revoke all on public.packing_sessions from anon, authenticated;

-- 2) ช่องของระบบแพ็คเองบนออเดอร์ — ไม่ใช้ status='packed' เพราะ Shopee เขียนทับทุก 15 นาที
alter table public.platform_orders add column if not exists packed_at timestamptz;
alter table public.platform_orders add column if not exists packed_by uuid;

-- 3) หมายเหตุตอนแพ็คบนสินค้าแม่ (ตั้งครั้งเดียว ใช้ทุกออเดอร์) — แยกจาก work_instruction_notes (= คำสั่งผลิต)
alter table public.parent_skus_v2 add column if not exists pack_note text;
alter table public.parent_skus_v2 add column if not exists pack_flags text[] not null default '{}'::text[];

-- 4) ค้นออเดอร์จากรหัสที่ยิง ให้เร็ว
create index if not exists idx_platform_orders_order_no on public.platform_orders(order_no) where order_no is not null;
create index if not exists idx_platform_orders_tracking_no on public.platform_orders(tracking_no) where tracking_no is not null;
create index if not exists idx_platform_orders_package_no on public.platform_orders(package_no) where package_no is not null;
create index if not exists idx_platform_orders_external_id on public.platform_orders(external_order_id);

-- 5) สิทธิ์
insert into public.erp_permissions (key, label, category, is_dangerous, sort_order) values
  ('packing.pack','แพ็คสินค้า (สถานีแพ็ค)','📦 สินค้า (Products)',false,730),
  ('packing.view_video','ดูคลิปแพ็ค/หลักฐาน','📦 สินค้า (Products)',false,731),
  ('packing.dashboard','ดูแดชบอร์ดพนักงานแพ็ค','📦 สินค้า (Products)',false,732),
  ('packing.manage','ตั้งค่าระบบแพ็ค (กล่อง/หมายเหตุ/เก็บถาวร)','📦 สินค้า (Products)',false,733)
on conflict (key) do nothing;
insert into public.erp_role_permissions (role_key, permission_key)
select r.role_key, r.permission_key from (values
  ('manager','packing.pack'),('manager','packing.view_video'),('manager','packing.dashboard'),('manager','packing.manage'),
  ('staff','packing.pack')
) as r(role_key, permission_key)
on conflict (role_key, permission_key) do nothing;

-- 6) เมนู: แอปขายออนไลน์ หมวดงานขายออนไลน์ ต่อจากศูนย์ออเดอร์
insert into public.erp_menu_items (label, href, icon, app_keys, section, section_order, sort_order, permission_key)
select * from (values
  ('แพ็คสินค้า', '/packing', 'i:package', array['marketplace']::text[], 'งานขายออนไลน์', 20, 21, 'packing.pack')
) as v(label, href, icon, app_keys, section, section_order, sort_order, permission_key)
where not exists (select 1 from public.erp_menu_items m where m.href = v.href);
