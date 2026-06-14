-- ที่มาของของบนชั้น QC (production | stock | purchase | return | other)
-- รองรับ "ใส่ของเข้าชั้นเอง" (ยอดยกมา/ของที่ไม่ได้มาจากการผลิต)
alter table public.qc_warehouse_items add column if not exists source text;
