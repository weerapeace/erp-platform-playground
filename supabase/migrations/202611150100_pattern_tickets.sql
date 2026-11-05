-- ตั๋วงานช่าง Pattern (ทำแบบตัด / บล็อก / แบบเย็บ / สกรีน / เลเซอร์ / เกรดไซซ์ / แบบปัก / อื่นๆ)
-- เจ้าของขอ 2026-11-05: หน้าให้ช่าง pattern ดูว่ามีงานอะไรต้องทำ + รายละเอียดไทย/อังกฤษ + แนบไฟล์ใหญ่ใน Google Drive
--   + เพิ่มตำแหน่ง "ฝ่ายออกแบบ" (เป็นคนเปิดตั๋ว)
-- ไฟล์แนบไม่เก็บในตาราง — อยู่ในโฟลเดอร์ Drive ต่อตั๋ว (drive_folder_id) อ่านรายการสดจาก Drive
-- เข้าถึงผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (เปิด RLS ไม่ตั้ง policy = anon/authenticated อ่านตรงไม่ได้)

-- 1) ประเภทงาน (ตั้งค่าได้: ชื่อ 2 ภาษา · ไอคอน · สี · เช็กลิสต์ตั้งต้น · ไฟล์ที่ต้องส่งกลับ)
create table public.pattern_ticket_types (
  key          text primary key,
  label_th     text not null,
  label_en     text not null,
  icon         text not null default 'i:file',
  color        text not null default 'slate',
  checklist    jsonb not null default '[]'::jsonb,      -- ["ขึ้นแบบชิ้นส่วนครบ", ...]
  deliverables text[] not null default '{}',            -- {"DXF","PDF"}
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.pattern_ticket_types enable row level security;

insert into public.pattern_ticket_types (key, label_th, label_en, icon, color, checklist, deliverables, sort_order) values
 ('cut',    'ทำแบบตัด',     'Cutting pattern',        'i:scissors',      'violet', '["ขึ้นแบบชิ้นส่วนครบ","ใส่เกรนผ้า + รอยบาก","ใส่ค่าเย็บ (ระยะเผื่อตะเข็บ)","ระบุจำนวนชิ้นต่อตัว","ส่งไฟล์ให้ห้องตัด"]', '{DXF,PDF,AI}', 10),
 ('block',  'ทำบล็อก',      'Block / template',       'i:layout-grid',   'teal',   '["วัดขนาดจากแบบตัด","ระบุวัสดุบล็อก (อะคริลิก/ไม้/เหล็ก)","ทำจุดเจาะ / ร่องนำ","ส่งไฟล์ให้ร้านทำบล็อก","ทดลองใช้กับชิ้นจริง"]', '{AI,PDF,JPG}', 20),
 ('sew',    'ทำแบบเย็บ',    'Sewing spec',            'i:needle-thread', 'orange', '["ลำดับขั้นตอนเย็บ","ระบุชนิดตะเข็บ + ระยะฝีเข็ม","ระบุด้าย / สีด้าย","ภาพใกล้จุดที่เย็บยาก","ผูกขั้นตอนงานเหมา"]', '{PDF,JPG,PSD}', 30),
 ('screen', 'ทำแบบสกรีน',   'Screen print artwork',   'i:brush',         'pink',   '["ไฟล์ vector ขนาดจริง 1:1","แยกสี (color separation)","ระบุรหัสสี Pantone","ภาพจำลองตำแหน่งบนชิ้นงาน","ส่งโรงสกรีน"]', '{AI,PSD,PNG}', 40),
 ('laser',  'ทำแบบเลเซอร์', 'Laser cut / engrave',    'i:bolt',          'amber',  '["แยกเลเยอร์เส้นตัด / เส้นแกะ","ปิดเส้นทุกรูป (closed path)","ชดเชยระยะที่เลเซอร์กินเนื้อ (kerf)","จัดวางประหยัดวัสดุ","ทดสอบชิ้นแรก"]', '{DXF,AI,SVG}', 50),
 ('grade',  'เกรดไซซ์',     'Size grading',           'i:ruler-measure', 'blue',   '["ตารางไซซ์อ้างอิง","ขยาย / ย่อทุกไซซ์","ตรวจรอยต่อตรงกัน","ส่งไฟล์แยกไซซ์"]', '{DXF,PDF,XLSX}', 60),
 ('emb',    'แบบปัก',       'Embroidery file',        'i:flower',        'green',  '["ขนาดจริงบนชิ้นงาน","ระบุสีด้ายปัก","แปลงไฟล์จักรปัก","ปักทดสอบ"]', '{DST,PES,AI}', 70),
 ('other',  'อื่นๆ',        'Other',                  'i:dots-vertical', 'slate',  '[]', '{}', 99);

-- 2) ตั๋วงาน
create table public.pattern_tickets (
  id              uuid primary key default gen_random_uuid(),
  ticket_no       text unique,
  type_key        text not null references public.pattern_ticket_types(key),
  title           text not null,
  sku_code        text,                                  -- รหัสสินค้า/รุ่น (พิมพ์หรือเลือก)
  parent_sku_id   uuid,
  description_th  text not null default '',
  description_en  text not null default '',
  en_edited       boolean not null default false,        -- คนแก้คำแปลเอง (ไม่ทับด้วยแปลอัตโนมัติ)
  status          text not null default 'new' check (status in ('new','doing','review','fix','done','cancelled')),
  priority        text not null default 'normal' check (priority in ('normal','urgent')),
  due_date        date,
  requester_id    uuid,
  requester_name  text,
  requester_dept  text,                                  -- ตำแหน่งของผู้เปิดตั๋ว (snapshot) เช่น "ฝ่ายออกแบบ"
  assignee_id     uuid,
  assignee_name   text,
  checklist       jsonb not null default '[]'::jsonb,    -- [{label, done}]
  links           jsonb not null default '[]'::jsonb,    -- ลิงก์ Drive/อื่นๆ ที่วางเอง [{url,label}]
  drive_folder_id text,
  drive_folder_url text,
  last_note       text,                                  -- เหตุผลตีกลับ/ยกเลิกล่าสุด
  started_at      timestamptz,
  submitted_at    timestamptz,
  done_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pattern_tickets_status_idx   on public.pattern_tickets (status, due_date);
create index pattern_tickets_assignee_idx on public.pattern_tickets (assignee_id) where status not in ('done','cancelled');
alter table public.pattern_tickets enable row level security;

-- 3) เลขตั๋ว PT-YYYYMM-0001 (ของกลาง erp_next_number)
insert into public.erp_numbering_rules (key, label, pattern, reset_policy, current_value, active, notes)
values ('pattern_ticket', 'ตั๋วงานช่าง Pattern', 'PT-{YYYYMM}-{0000}', 'monthly', 0, true, 'หน้า /design/pattern-tickets')
on conflict (key) do nothing;

-- 4) สิทธิ์
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
 ('pattern.view',   'ดูตั๋วงาน Pattern',          'production', 'เปิดหน้าตั๋วงานช่าง Pattern',                         false, 400),
 ('pattern.create', 'เปิดตั๋วงาน Pattern',         'production', 'สร้างตั๋วสั่งงานช่าง Pattern + แนบไฟล์',                false, 401),
 ('pattern.work',   'รับ/ทำงานตั๋ว Pattern (ช่าง)', 'production', 'กดรับงาน ติ๊กเช็กลิสต์ ส่งตรวจ แนบไฟล์งาน',            false, 402),
 ('pattern.manage', 'จัดการตั๋ว Pattern ทั้งหมด',   'production', 'แก้/มอบหมาย/อนุมัติ/ยกเลิกตั๋วของทุกคน + ตั้งค่าประเภทงาน', false, 403)
on conflict (key) do nothing;

-- 5) ตำแหน่งใหม่ "ฝ่ายออกแบบ" — ผู้ใช้มีได้ตำแหน่งเดียว จึงตั้งต้นจากสิทธิ์ "พนักงาน" ทั้งชุด (ใช้งานอื่นได้เหมือนเดิม)
--    + เปิดตั๋ว/ดูตั๋ว (ไม่ให้ pattern.work เพราะไม่ใช่ช่าง)
insert into public.erp_roles (key, label, description, color, is_builtin, active, sort_order)
values ('designer', 'ฝ่ายออกแบบ', 'ออกแบบสินค้า + เปิดตั๋วสั่งงานช่าง Pattern (สิทธิ์ตั้งต้น = พนักงาน)', 'pink', false, true, 35)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key)
select 'designer', permission_key from public.erp_role_permissions where role_key = 'staff'
on conflict do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
 ('designer','pattern.view'), ('designer','pattern.create'),
 ('staff','pattern.view'),    ('staff','pattern.work'),
 ('manager','pattern.view'),  ('manager','pattern.create'), ('manager','pattern.work'), ('manager','pattern.manage'),
 ('admin','pattern.view'),    ('admin','pattern.create'),   ('admin','pattern.work'),   ('admin','pattern.manage')
on conflict do nothing;

-- 6) เมนู: แอปออกแบบ + แอปผลิต หมวด "🎨 ออกแบบสินค้า" (เห็นเฉพาะคนที่มี pattern.view)
insert into public.erp_menu_items (href, icon, label, section, app_keys, sort_order, section_order, permission_key, is_active, show_in_sidebar, show_in_launcher, app_overrides)
select '/design/pattern-tickets', '✂️', 'ตั๋วงานช่าง Pattern', '🎨 ออกแบบสินค้า', array['design','production'], 10, 35, 'pattern.view', true, true, true, '{}'::jsonb
where not exists (select 1 from public.erp_menu_items where href = '/design/pattern-tickets');

-- 7) ทะเบียนโมดูล (โผล่ในหน้า "โมดูลทั้งหมด")
insert into public.erp_modules (module_key, table_name, label, description, primary_field, source_type, config, is_active, sort_order, group_label)
select 'pattern_tickets', 'pattern_tickets', 'ตั๋วงานช่าง Pattern', 'ตั๋วสั่งงานช่าง Pattern (ตัด/บล็อก/เย็บ/สกรีน/เลเซอร์) — หน้าเฉพาะทางที่ /design/pattern-tickets',
       'ticket_no', 'physical', '{"icon":"✂️","entity_type":"pattern_tickets","page":"/design/pattern-tickets"}'::jsonb, true, 210, 'เอกสาร'
where not exists (select 1 from public.erp_modules where module_key = 'pattern_tickets');
