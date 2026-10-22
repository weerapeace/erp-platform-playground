-- 🖼 รูปตัดพื้น (PNG) ของรุ่น — ช่องรูปแยกจากรูปปก (เจ้าของขอ 2026-10-22 · Section "การ์ดบนฉาก")
-- เหตุผล: การ์ดกระจกบนฉากต้องการรูปสินค้าพื้นใส · รูปปกเดิมมีพื้นขาว/เทา
-- เว็บร้านได้ค่าผ่าน imageFields.png_image_r2_key (ทะเบียนฟิลด์ชนิด image ของ Parent SKU ส่งออกอัตโนมัติ — lib/website-parent-fields)
-- คอลัมน์ใหม่ว่าง (null) = รุ่นเดิมทุกตัวเหมือนเดิม · ไม่มี = เว็บลบพื้นเรียบของรูปปกให้เอง
alter table public.parent_skus_v2
  add column if not exists png_image_r2_key text;

comment on column public.parent_skus_v2.png_image_r2_key is 'รูปตัดพื้น (PNG พื้นใส) ของรุ่น — การ์ดบนฉากเว็บร้าน · r2 key';

-- ทะเบียนฟิลด์ (ฟอร์ม Parent SKU กลุ่มรูป · ถัดจากรูปปก)
insert into public.erp_module_fields (module_id, field_key, column_name, field_label, field_label_en, ui_field_type, data_type, source, group_key, is_visible, is_required, is_editable, is_filterable, is_sortable, is_searchable, width, display_order, show_in_form, help_text)
select m.id, 'png_image_r2_key', 'png_image_r2_key', 'รูปตัดพื้น (PNG)', 'Cut-out image (PNG)', 'image', 'text', 'physical', 'media', false, false, true, false, false, false, 80, 11, true,
  'รูปสินค้าพื้นใส (PNG) — การ์ดกระจกบน Section "การ์ดบนฉาก" ของเว็บร้าน · ไม่ใส่ = เว็บลบพื้นขาว/เทาเรียบของรูปปกให้เอง'
from public.erp_modules m
where m.table_name = 'parent_skus_v2'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.field_key = 'png_image_r2_key');
