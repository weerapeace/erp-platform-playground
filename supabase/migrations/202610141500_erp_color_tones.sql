-- 🎨 โทนสี (ของกลาง ใช้ทุกร้าน) — จัดชื่อสีของ SKU เป็นกลุ่ม ให้ลูกค้ากรองบนเว็บได้ เช่น โทน "แดง" = แดง · แดงเลือดหมู · แดงไวน์
-- ตรรกะกลาง: lib/color-tone.ts (ฝั่ง ERP) — ชื่อสี 1 ชื่ออยู่ 1 โทน · สีผสม "กรมท่า-ส้ม" นับเข้าทุกโทนที่อยู่ในชื่อ
--   members  = ชื่อสีที่ย้ายเข้ามาเอง (ชนะเสมอ)
--   keywords = คำขึ้นต้นชื่อสีที่จับเข้าโทนนี้อัตโนมัติ (สีใหม่ในอนาคตเข้าโทนเอง)
--   excludes = ชื่อสีที่ไม่เอา แม้คำขึ้นต้นตรง
-- อ่าน/เขียนผ่าน /api/color-tones (service role + guardApi) เท่านั้น → เปิด RLS ไม่มี policy (แบบเดียวกับ erp_color_dictionary)
create table if not exists public.erp_color_tones (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  hex text not null default '#888888',
  keywords text[] not null default '{}',
  members text[] not null default '{}',
  excludes text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.erp_color_tones enable row level security;
comment on table public.erp_color_tones is 'โทนสีสำหรับกรองบนเว็บร้าน — ดู lib/color-tone.ts';

-- โทนตั้งต้น (เพิ่มเฉพาะตอนตารางยังว่าง) — เจ้าของปรับ/ย้ายสีได้ในหน้าต่าง 🎨 โทนสี
insert into public.erp_color_tones (key, name, hex, keywords, members, sort_order)
select * from (values
  ('black',   'ดำ',            '#1A1A1A', array['ดำ'],                                   array[]::text[], 1),
  ('white',   'ขาว / ครีม',    '#F3EFE6', array['ขาว','ครีม','เบจ','งาช้าง'],             array[]::text[], 2),
  ('grey',    'เทา',           '#8C8F94', array['เทา','เงิน'],                           array[]::text[], 3),
  ('brown',   'น้ำตาล',        '#6B4226', array['น้ำตาล','แทน','คาราเมล','กากี','ช็อก'], array[]::text[], 4),
  ('red',     'แดง',           '#C62828', array['แดง','ไวน์','เลือดหมู'],                array[]::text[], 5),
  ('pink',    'ชมพู',          '#F2A7B8', array['ชมพู','โอรส','บานเย็น'],                array[]::text[], 6),
  ('orange',  'ส้ม / เหลือง',  '#F2C230', array['ส้ม','เหลือง','มัสตาร์ด'],              array[]::text[], 7),
  ('green',   'เขียว',         '#2E7D4F', array['เขียว'],                                array[]::text[], 8),
  ('blue',    'ฟ้า / น้ำเงิน', '#2457A6', array['ฟ้า','น้ำเงิน'],                        array[]::text[], 9),
  ('navy',    'กรมท่า',        '#1F2A44', array['กรมท่า'],                               array[]::text[], 10),
  ('purple',  'ม่วง',          '#7A5BA6', array['ม่วง','ไลแลค'],                         array[]::text[], 11),
  ('pattern', 'ลาย / พิมพ์ลาย','#B08850', array['ลาย'],                                  array['snow leopard','classic leopard','rosy leopard','รุ้ง','ดาว','ตาราง'], 12)
) as v(key, name, hex, keywords, members, sort_order)
where not exists (select 1 from public.erp_color_tones);
