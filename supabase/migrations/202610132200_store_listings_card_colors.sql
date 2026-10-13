-- 🎴 สีที่โชว์บนการ์ดสินค้า (ต่อรุ่น ต่อร้าน) — ตั้งที่ Parent SKU → แท็บ 🛍 เว็บไซต์
-- { "colors": ["ดำ","น้ำตาล"] | null, "main": "ดำ" | null }
--   colors = ชื่อสีที่โชว์เป็นจุดบนการ์ด เรียงตามนี้ (null = ทุกสีตามลำดับเดิม)
--   main   = สีหลัก → รูปแรกบนการ์ดเป็นรูปของสีนี้ (null = ตามลำดับเดิม)
-- เก็บเป็นชื่อสี (ไม่ใช่ id SKU) เพื่อให้คงอยู่แม้สร้าง SKU ใหม่ · ชื่อที่ไม่มีแล้วจะถูกข้ามเอง
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม
alter table public.store_listings add column if not exists web_card_colors jsonb;
comment on column public.store_listings.web_card_colors is 'สีบนการ์ดสินค้า {colors: string[]|null, main: string|null} — ดู lib/website-card-colors.ts';
