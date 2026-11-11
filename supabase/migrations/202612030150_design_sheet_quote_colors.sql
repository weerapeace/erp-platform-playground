-- 🎨 รอบเสนอราคา: หลายสีต่อไซส์ · เจ้าของอนุมัติ 2026-11-11 ("ทำตามแบบเลย" หลังดู widget แบ่งจำนวนแต่ละสีไม่เท่ากัน)
-- 1 แถว design_sheet_quotes = 1 ช่อง (ครั้งที่ × ไซส์ × ขั้นจำนวน) — เพิ่มรายการสีของช่องนั้น:
--   colors = [{ "name": "แดง", "hex": "#E24B4A", "qty": 600, "delta": 0 }, ...]
--   qty = จำนวนของสีนี้ในขั้นจำนวนนั้น (รวมแล้วควรเท่ากับ qty ของช่อง — ไม่บังคับ หน้าจอเตือนเอง)
--   delta = ราคาต่าง ± บาท จากราคาที่เสนอของช่อง (แยกราคาตามสี) · null/0 = ราคาเดียวกัน
-- ว่าง (null) = ไม่แยกสี — รอบเก่าทั้งหมดเหมือนเดิม · ทำความสะอาดค่าที่ lib/quote-colors.ts (cleanQuoteColors)
alter table public.design_sheet_quotes add column if not exists colors jsonb;

comment on column public.design_sheet_quotes.colors is
  'สีของช่องนี้ [{name,hex,qty,delta}] · qty = จำนวนของสีในขั้นนี้ · delta = ราคาต่างจากราคาที่เสนอ (บาท) · null = ไม่แยกสี (lib/quote-colors.ts)';
