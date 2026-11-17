-- ชุดอะไหล่ (เจ้าของอนุญาต 2026-11-17): วัสดุตีราคาตัวหลัก (เช่น ซิปฟันเหล็ก #5) จำว่า "มาพร้อม" อะไหล่อะไร
--   [{ "item_id": uuid, "qty": 1, "on": true }] · on = ติ๊กไว้ให้ก่อนตอนถาม (ผู้ใช้เอาออกได้ทุกครั้ง)
--   ใช้ที่ป๊อป "เพิ่มอะไหล่" ใบงานออกแบบ (components/parts-cart-modal · lib/parts-cart) · ค่าเริ่ม [] = ไม่มีชุด ข้อมูลเดิมไม่เปลี่ยน
alter table public.design_price_items add column if not exists set_items jsonb not null default '[]'::jsonb;
comment on column public.design_price_items.set_items is 'ชุดอะไหล่ที่มาพร้อมวัสดุนี้ [{item_id, qty, on}] — ป๊อปเพิ่มอะไหล่ถามก่อนลง';
