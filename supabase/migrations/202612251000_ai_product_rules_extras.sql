-- ป๊อป AI ร่างรายละเอียดสินค้า 5 ขั้น (2026-11-25): ค่าตั้งเพิ่มต่อกฎประเภทสินค้า
--   highlights = รายการจุดเด่นให้ติ๊กในขั้น "ประเภท & จุดเด่น"
--   manual_required = ช่องที่ต้องกรอกเองในขั้นสุดท้าย (warranty · custom_size · size_description_id · special_description_id)
alter table public.erp_ai_product_rules add column if not exists extras jsonb not null default '{}'::jsonb;
comment on column public.erp_ai_product_rules.extras is 'ค่าตั้งเพิ่มของป๊อป AI ร่าง 5 ขั้น: { highlights: string[] รายการจุดเด่นให้ติ๊ก, manual_required: string[] ช่องกรอกมือที่บังคับ }';
