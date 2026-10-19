-- 📝 ข้อความสำเร็จรูป "หลายแบบ" (product_highlight_items)
--   เหตุผล: เจ้าของอยากให้ 1 ข้อความเลือกได้หลายประโยค (เช่น ซิป: ฟันเหล็ก / ไนล่อน เปลี่ยนทั้งประโยค)
--           หรือติ๊กสลับ 2 ประโยค (ผ้าซับใน ↔ ผ้าซับในทอลาย) — เดิม 1 รายการเก็บได้ประโยคเดียว (name / name_en)
--   variant_mode: null = ข้อความเดียว (แบบเดิม) · 'select' = Dropdown หลายแบบ · 'toggle' = ติ๊กสลับ 2 แบบ
--   variants: [{ "label": "ฟันเหล็ก", "th": "ซิปฟันเหล็ก ...", "en": "Smooth-glide metal zipper" }, ...] (แบบแรก = ค่าเริ่ม)
--   ใช้ที่: lib/phrase-variants · ป๊อปแทรกรายละเอียด · รายละเอียดเพิ่ม (ติ๊ก) · products API (เว็บร้าน)
alter table public.product_highlight_items add column if not exists variant_mode text;
alter table public.product_highlight_items add column if not exists variants jsonb;

alter table public.product_highlight_items drop constraint if exists product_highlight_items_variant_mode_check;
alter table public.product_highlight_items add constraint product_highlight_items_variant_mode_check
  check (variant_mode is null or variant_mode in ('select', 'toggle'));

comment on column public.product_highlight_items.variant_mode is 'null = ข้อความเดียว · select = Dropdown หลายแบบ · toggle = ติ๊กสลับ 2 แบบ';
comment on column public.product_highlight_items.variants is '[{label, th, en}] ประโยคของแต่ละแบบ (แบบแรก = ค่าเริ่ม · toggle: แบบที่ 2 = ตอนติ๊ก)';
