-- ============================================================
-- Y9 (audit แอปจัดการงาน 2026-10-21): ลบสารบัญซ้ำ — รันบน DB แล้ว (เจ้าของอนุมัติ)
-- skus_v2 / parent_skus_v2 มีสารบัญค้นชื่อ (gin name_th gin_trgm_ops) หน้าตาเหมือนกัน 2 ตัว → บันทึกสินค้าช้าลงเปล่า ๆ
-- คงไว้: idx_skus_v2_name_th_trgm, idx_parent_skus_v2_name_th_trgm
-- ย้อนกลับ:
--   create index idx_skus_v2_name_trgm on public.skus_v2 using gin (name_th gin_trgm_ops);
--   create index idx_parent_skus_v2_name_trgm on public.parent_skus_v2 using gin (name_th gin_trgm_ops);
-- ============================================================
drop index if exists public.idx_skus_v2_name_trgm;
drop index if exists public.idx_parent_skus_v2_name_trgm;
