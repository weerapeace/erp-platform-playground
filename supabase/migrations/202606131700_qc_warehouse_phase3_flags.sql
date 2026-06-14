-- เฟส 3: ธงงานลูกค้า (ที่แบรนด์) + ธงช่างเหมา (ที่พนักงาน)
-- ใช้คุมการแสดง badge "งานลูกค้า" (สี/ธงต่อแบรนด์) และ "งานเหมา" (ช่างที่ส่งงาน) บนโกดัง QC
alter table public.brands    add column if not exists is_customer_job boolean not null default false;
alter table public.employees add column if not exists is_subcontract  boolean not null default false;
