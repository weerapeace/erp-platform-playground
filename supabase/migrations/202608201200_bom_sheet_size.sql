-- ผ้าที่ซื้อเป็น "ผืน/ชิ้น" (เช่น ผ้าขาวม้า 100×200 ซม.)
--
-- เดิมชนิด "ผ้า (ชิ้น)" ตั้งวิธีคิดเป็น area_face (หารด้วยหน้ากว้างแบบผ้าม้วน) → ตัวเลขไม่มีความหมาย
-- ที่ถูกคือ area_sheet: พื้นที่ที่ตัด × (1+เผื่อเสีย) ÷ พื้นที่ผืนเต็ม = ใช้กี่ผืน
alter table public.skus_v2
  add column if not exists sheet_width_cm  numeric,
  add column if not exists sheet_length_cm numeric;

alter table public.bom_lines
  add column if not exists sheet_width  numeric,
  add column if not exists sheet_length numeric;

comment on column public.skus_v2.sheet_width_cm  is 'ขนาดผืนเต็ม กว้าง (ซม.) — ใช้กับวัตถุดิบที่ขายเป็นผืน/ชิ้น';
comment on column public.skus_v2.sheet_length_cm is 'ขนาดผืนเต็ม ยาว (ซม.) — ใช้กับวัตถุดิบที่ขายเป็นผืน/ชิ้น';
comment on column public.bom_lines.sheet_width   is 'ขนาดผืนเต็ม กว้าง (ซม.) ของบรรทัดนี้ (ไม่ใส่ = ใช้ของ SKU)';
comment on column public.bom_lines.sheet_length  is 'ขนาดผืนเต็ม ยาว (ซม.) ของบรรทัดนี้ (ไม่ใส่ = ใช้ของ SKU)';

update public.material_groups set calc_method = 'area_sheet' where code = 'fabric_piece';
