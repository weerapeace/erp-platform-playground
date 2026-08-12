-- ลำดับความสำคัญของใบสั่งผลิต (ใช้ในหน้า "แผนผู้บริหาร" บนบอร์ดจ่ายงาน)
--   0 = ปกติ · 1 = สำคัญ · 2 = เร่งด่วน
-- ผู้บริหาร (แอดมิน) ติดธงที่หน้าแผน → ธงไปโผล่บนการ์ดหน้าช้อปจ่ายงาน ให้คนจ่ายงานรู้ว่าต้องทำอันไหนก่อน
alter table public.manufacturing_orders
  add column if not exists priority      smallint    not null default 0,
  add column if not exists priority_note text,
  add column if not exists priority_at   timestamptz,
  add column if not exists priority_by   text;

comment on column public.manufacturing_orders.priority      is '0=ปกติ 1=สำคัญ 2=เร่งด่วน (ตั้งจากหน้าแผนผู้บริหาร)';
comment on column public.manufacturing_orders.priority_note is 'เหตุผล/โน้ตสั้น ๆ ของงานเร่ง';
comment on column public.manufacturing_orders.priority_at   is 'เวลาที่ติดธงล่าสุด';
comment on column public.manufacturing_orders.priority_by   is 'อีเมล/ชื่อคนที่ติดธงล่าสุด';

-- ใบที่ติดธงมีน้อย → index บางส่วนพอ (กรอง/เรียง "งานเร่งก่อน" เร็ว)
create index if not exists idx_mo_priority on public.manufacturing_orders (priority) where priority > 0;
