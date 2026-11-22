-- คำแปลภาษาอื่น (นอกจากไทย/อังกฤษ) ของ Parent SKU — เก็บรวมคอลัมน์เดียว (เจ้าของเลือก 2026-11-22 "ช่องรวมภาษาอื่นช่องเดียว")
--   รูปแบบ: { "ja": { "name_th": "…", "introduction": "…", "description": "…" } }
--   ฟอร์มกลางเห็นเป็นช่องเสมือน i18n_<ภาษา>_<ช่อง> (lib/record-translations · API master-v2 แตก/รวมให้)
--   ไทย/อังกฤษอยู่คอลัมน์เดิม ไม่ย้าย · เพิ่มภาษาใหม่ไม่ต้องแก้ฐานข้อมูลอีก
alter table public.parent_skus_v2 add column if not exists translations jsonb not null default '{}'::jsonb;

comment on column public.parent_skus_v2.translations is
  'คำแปลภาษาอื่น {lang: {field: text}} — lib/record-translations (ช่องเสมือน i18n_<lang>_<field> ในฟอร์มกลาง)';
