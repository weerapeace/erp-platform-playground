-- 📏 ทะเบียนสี: เพิ่มชนิดจุดสี "none" = ไซส์ / ไม่ใช่สี (2026-11-10)
-- ชื่ออย่าง "M (20.5 cm.)" · "10 รู" ที่ติดมากับช่องสีของ SKU → ไม่ต้องตั้งจุดสี · ชื่อผสมใช้แค่ส่วนที่เป็นสี (lib/color-swatch.ts)
-- ขยายกติกาเดิมอย่างเดียว ไม่แตะข้อมูล · โค้ดรุ่นเก่าอ่าน "none" เป็น "ยังไม่ตั้ง" (rowToSwatchEntry) จึงไม่พัง
alter table public.erp_color_dictionary drop constraint if exists erp_color_dictionary_swatch_kind_chk;
alter table public.erp_color_dictionary add constraint erp_color_dictionary_swatch_kind_chk
  check (swatch_kind is null or swatch_kind = any (array['solid'::text, 'split'::text, 'image'::text, 'none'::text]));
