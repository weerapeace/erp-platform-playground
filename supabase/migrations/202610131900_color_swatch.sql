-- 🎨 ทะเบียนสีกลาง — ต่อยอด "พจนานุกรมสี" (erp_color_dictionary) ให้แต่ละชื่อสีมีหน้าตาจุดสีด้วย
-- ใช้กับจุดสีบนการ์ดสินค้า / ปุ่มเลือกสีหน้าสินค้า บนเว็บร้าน (และ ERP ภายหลัง) — ดู lib/color-swatch.ts
--   swatch_kind      null = ยังไม่ตั้ง · solid = สีเดียว · split = หลายสีแบ่งช่อง (2–4) · image = รูปลาย
--   swatch_colors    รหัสสี #RRGGBB (solid ใช้ตัวแรก · split ใช้ 2–4 ตัว)
--   swatch_image_key r2 key ของรูปลาย (kind = image)
-- ชื่อสีผสม เช่น "กรมท่า-ครีม-ขาว" ไม่ต้องมีแถวของตัวเอง — ระบบแยกตามขีดแล้วประกอบจากสีย่อยให้ (ตั้งทับเฉพาะชื่อได้)
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม (คำแปลไทย↔อังกฤษยังทำงานเหมือนเดิม)

alter table public.erp_color_dictionary
  add column if not exists swatch_kind text,
  add column if not exists swatch_colors text[] not null default '{}',
  add column if not exists swatch_image_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'erp_color_dictionary_swatch_kind_chk') then
    alter table public.erp_color_dictionary
      add constraint erp_color_dictionary_swatch_kind_chk check (swatch_kind is null or swatch_kind in ('solid', 'split', 'image'));
  end if;
end $$;

comment on column public.erp_color_dictionary.swatch_kind is 'หน้าตาจุดสี: null=ยังไม่ตั้ง · solid · split · image';
comment on column public.erp_color_dictionary.swatch_colors is 'รหัสสี #RRGGBB (solid=ตัวแรก · split=2–4 ตัว)';
comment on column public.erp_color_dictionary.swatch_image_key is 'r2 key ของรูปลาย (kind=image)';
