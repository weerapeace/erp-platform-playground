-- ก้อน 3: สถานะงานจัดการได้เต็ม (สถานะ + เส้นทาง transition)
create table if not exists erp_creative_statuses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  color text not null default 'slate',         -- ชื่อชุดสี (map เป็นคลาส Tailwind ในโค้ด)
  sort_order int not null default 100,
  progress_percent int not null default 0,
  is_terminal boolean not null default false,      -- ปิดงาน (ดูอย่างเดียว)
  is_approval_gate boolean not null default false, -- สถานะรอตรวจ (ต้องอนุมัติ)
  is_default boolean not null default false,       -- สถานะเริ่มต้นตอนสร้างงาน
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists erp_creative_status_transitions (
  id uuid primary key default gen_random_uuid(),
  from_key text not null,
  to_key text not null,
  label text not null,
  kind text not null default 'normal',          -- normal/approve/reject/revise/block
  sort_order int not null default 100,
  unique (from_key, to_key)
);
create index if not exists idx_creative_transitions_from on erp_creative_status_transitions (from_key);
alter table erp_creative_statuses enable row level security;
alter table erp_creative_status_transitions enable row level security;

insert into erp_creative_statuses (key,label,color,sort_order,progress_percent,is_terminal,is_approval_gate,is_default) values
 ('backlog','รอคิว','slate',10,0,false,false,true),
 ('ready','พร้อมทำ','sky',20,5,false,false,false),
 ('in_progress','กำลังทำ','indigo',30,30,false,false,false),
 ('need_review','รอตรวจ','amber',40,70,false,true,false),
 ('revision','ต้องแก้','orange',50,50,false,false,false),
 ('approved','อนุมัติแล้ว','emerald',60,85,false,false,false),
 ('scheduled','ตั้งเวลาโพสต์','violet',70,90,false,false,false),
 ('published','เผยแพร่แล้ว','teal',80,95,true,false,false),
 ('done','เสร็จ','green',90,100,true,false,false),
 ('blocked','ติดปัญหา','red',100,30,false,false,false),
 ('cancelled','ยกเลิก','slate',110,0,true,false,false)
on conflict (key) do nothing;

insert into erp_creative_status_transitions (from_key,to_key,label,kind,sort_order) values
 ('backlog','in_progress','▶ เริ่มงาน','normal',10),('backlog','ready','พร้อมทำ','normal',20),('backlog','cancelled','ยกเลิก','normal',30),
 ('ready','in_progress','▶ เริ่มงาน','normal',10),('ready','cancelled','ยกเลิก','normal',20),
 ('in_progress','need_review','📤 ส่งตรวจ','normal',10),('in_progress','blocked','⚠ ติดปัญหา','block',20),('in_progress','cancelled','ยกเลิก','normal',30),
 ('need_review','approved','✓ อนุมัติ','approve',10),('need_review','revision','↩ ตีกลับแก้','revise',20),('need_review','cancelled','ยกเลิก','normal',30),
 ('revision','in_progress','▶ แก้ต่อ','normal',10),('revision','cancelled','ยกเลิก','normal',20),
 ('approved','published','🚀 เผยแพร่','normal',10),('approved','scheduled','🗓 ตั้งเวลา','normal',20),('approved','done','✓ ปิดงาน','normal',30),
 ('scheduled','published','🚀 เผยแพร่','normal',10),('scheduled','done','✓ ปิดงาน','normal',20),
 ('published','done','✓ ปิดงาน','normal',10),
 ('blocked','in_progress','▶ ทำต่อ','normal',10),('blocked','cancelled','ยกเลิก','normal',20),
 ('done','in_progress','↩ เปิดใหม่','normal',10),
 ('cancelled','backlog','↩ เปิดใหม่','normal',10)
on conflict (from_key,to_key) do nothing;
