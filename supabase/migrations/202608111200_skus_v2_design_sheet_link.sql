-- ลิงก์ย้อนกลับ: SKU ตัวนี้ถูกสร้างมาจากใบงานออกแบบใบไหน (Design Sheets → Wizard สร้าง SKU)
-- ใช้ทำรายการ "SKU ที่เชื่อมกับใบงานนี้" ในป๊อปใบงาน (เจ้าของขอ 2026-08-11)
-- เพิ่มคอลัมน์ nullable + FK on delete set null (ลบใบงานแล้ว SKU ไม่หาย แค่ขาดลิงก์)
alter table public.skus_v2 add column if not exists design_sheet_id uuid references public.design_sheets(id) on delete set null;
create index if not exists idx_skus_v2_design_sheet on public.skus_v2(design_sheet_id) where design_sheet_id is not null;
comment on column public.skus_v2.design_sheet_id is 'ใบงานออกแบบที่สร้าง SKU นี้ (design_sheets.id) — ใช้ทำรายการ "SKU ที่เชื่อม" ในใบงาน';

-- backfill ของเดิมจาก audit log (action=create_skus เก็บ sku_codes ที่สร้างไว้ครบ)
update public.skus_v2 s
set design_sheet_id = a.entity_id
from (
  select l.entity_id, jsonb_array_elements_text(l.metadata->'sku_codes') as code
  from public.audit_logs l
  where l.entity_type = 'design_sheet' and l.action = 'create_skus'
    and jsonb_typeof(l.metadata->'sku_codes') = 'array'
) a
where upper(s.code) = upper(a.code) and s.design_sheet_id is null;
