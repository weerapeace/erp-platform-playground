-- รายการ "ที่มา" ของของบนชั้น QC (จัดการเพิ่ม/ลบ/แก้ได้)
create table if not exists public.qc_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.qc_sources enable row level security;
insert into public.qc_sources (name, sort_order) values
  ('ของในสต็อกเดิม (ยอดยกมา)', 10), ('ซื้อมา', 20), ('รับคืน', 30), ('อื่น ๆ', 99);
