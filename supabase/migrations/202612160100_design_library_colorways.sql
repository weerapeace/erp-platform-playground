-- 📚 Design Library รอบ 5 (เจ้าของสั่ง 2026-11-14): ชุดสี + ผูกใบงานออกแบบ
-- ไม่แตะข้อมูลเดิม — เพิ่ม 2 คอลัมน์ (ว่างได้) ในตารางเดิม
--  • design_library_renders.colorway_id = รูปนี้เป็นของชุดสีไหน (null = สีหลัก) · ชุดสีเก็บใน recipes.spec.colorways (jsonb เดิม)
--  • design_library_recipes.design_sheet_id = สูตรนี้ส่งไปเป็นใบงานออกแบบใบไหนแล้ว (ใช้ในช่วง 3 "ส่งเป็นใบงานออกแบบ")
--    ใบงานถูกลบ → ค่ากลับเป็น null (สูตรยังอยู่)

alter table public.design_library_renders add column if not exists colorway_id text;
alter table public.design_library_recipes add column if not exists design_sheet_id uuid references public.design_sheets(id) on delete set null;

create index if not exists design_library_recipes_design_sheet_idx on public.design_library_recipes (design_sheet_id) where design_sheet_id is not null;
