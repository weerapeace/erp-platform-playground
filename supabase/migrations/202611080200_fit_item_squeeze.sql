-- 📐 ป๊อปเทียบขนาด "ช่องใส่ตุ๊กตา" — เจ้าของเลือก (2026-10-30) ให้ตั้ง "นุ่ม บีบได้กี่ %" ต่อตุ๊กตาได้
-- เหตุผล: ค่ากลาง 10% ทำให้ตุ๊กตาผ้าที่บีบได้จริงมากกว่านั้น (เช่น Labubu หนา 7 ซม. ใส่ช่องลึก 5 ซม.) ถูกบอกว่าใส่ไม่ได้
-- squeeze_pct = 0–50 · ว่าง = ใช้ค่ากลาง 10% เหมือนเดิม (ข้อมูลเดิมไม่เปลี่ยนผล) · มีผลเฉพาะแถวที่ติ๊ก is_soft
-- ตรวจแล้ว: ตารางมีอยู่ ยังไม่มีคอลัมน์ชื่อนี้ · คอลัมน์ใหม่ว่างได้ ไม่แตะข้อมูลเดิม

alter table public.product_fit_items add column if not exists squeeze_pct numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_fit_items_squeeze_pct_range') then
    alter table public.product_fit_items
      add constraint product_fit_items_squeeze_pct_range check (squeeze_pct is null or (squeeze_pct >= 0 and squeeze_pct <= 50));
  end if;
end $$;

insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, width, display_order, show_in_form, options, help_text)
select m.id, 'squeeze_pct', 'squeeze_pct', 'บีบได้ (%)', 'Squeeze (%)', 'number', 'numeric', 'physical', 'core', true, false, true, false, true, 90, 38, true, '{}'::jsonb,
       'ใช้เมื่อติ๊ก "นุ่ม บีบได้" · ตุ๊กตาบีบให้เล็กลงได้กี่ % (0–50) · ว่าง = 10%'
from public.erp_modules m
where m.module_key = 'product_fit_items'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = 'squeeze_pct');

-- ลำดับในฟอร์ม: นุ่ม บีบได้ (37) → บีบได้ % (38) → ขนาดประมาณ (39)
update public.erp_module_fields f set display_order = 39
  from public.erp_modules m
 where m.id = f.module_id and m.module_key = 'product_fit_items' and f.field_key = 'size_estimated' and f.display_order = 38;

-- รูปตุ๊กตาใช้วางเทียบตามสเกลจริงในป๊อปด้วย → ต้องครอปชิดตัว (เดิมบอกให้ใช้ภาพจัตุรัส)
update public.erp_module_fields f
   set help_text = 'PNG ตัดพื้น ครอปชิดตัวตุ๊กตา (หัวถึงเท้าชิดขอบรูป) — ป๊อปเทียบขนาดวางรูปตามสเกลจริง · ใช้บนปุ่มเลือกใน Section เช็คขนาดด้วย'
  from public.erp_modules m
 where m.id = f.module_id and m.module_key = 'product_fit_items' and f.field_key = 'image_key';
