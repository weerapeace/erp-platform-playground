-- แม่แบบการ์ด: ติ๊ก "การ์ดพิเศษ" (เจ้าของเลือก 2026-11-25 รอบ 5 ข้อ 3)
-- คำสั่ง "การ์ดธรรมดา" เห็นเฉพาะแม่แบบธรรมดา · "การ์ดพิเศษ" เห็นเฉพาะแม่แบบที่ติ๊กพิเศษ
-- null = ยังไม่ได้ตั้ง → ระบบถือว่า การ์ดพับ = พิเศษ (lib/gift-card-design isSpecialTemplate)
alter table public.gift_card_templates add column if not exists is_special boolean;
comment on column public.gift_card_templates.is_special is 'การ์ดพิเศษ (true) / ธรรมดา (false) / null = ตามชนิด (การ์ดพับ = พิเศษ)';
