-- ข้อความการ์ดสำเร็จรูป (เจ้าของเลือก 2026-11-25 แบบ AB ข้อ 3) — kind card_phrase · value = กลุ่ม (วันเกิด/ขอบคุณ/ครบรอบ/ทั่วไป)
-- ใช้ร่วมทุกคำสั่งการ์ด · จัดการ (เพิ่ม/แก้/ซ่อน/เรียง) ที่ จัดการคำสั่ง › การ์ด › ข้อความสำเร็จรูป
alter table public.order_ops_options drop constraint if exists order_ops_options_kind_check;
alter table public.order_ops_options add constraint order_ops_options_kind_check
  check (kind in ('instruction_command','repair_topic','engrave_special','engrave_font','engrave_sku_type','engrave_sku_pos','command_choice','command_phrase','special_wrap','card_phrase'));

insert into public.order_ops_options (kind, label, value, sort_order)
select v.kind, v.label, v.value, v.sort_order from (values
  ('card_phrase', 'Happy Birthday', 'วันเกิด', 1),
  ('card_phrase', 'สุขสันต์วันเกิดนะ', 'วันเกิด', 2),
  ('card_phrase', 'ขอให้มีความสุขมาก ๆ ในวันเกิด', 'วันเกิด', 3),
  ('card_phrase', 'Thank you', 'ขอบคุณ', 4),
  ('card_phrase', 'ขอบคุณที่รักกันเสมอ', 'ขอบคุณ', 5),
  ('card_phrase', 'Happy Anniversary', 'ครบรอบ', 6),
  ('card_phrase', 'รักนะ ครบรอบอีกปีแล้ว', 'ครบรอบ', 7),
  ('card_phrase', 'For You', 'ทั่วไป', 8),
  ('card_phrase', 'ด้วยรัก', 'ทั่วไป', 9),
  ('card_phrase', 'Best wishes', 'ทั่วไป', 10)
) as v(kind, label, value, sort_order)
where not exists (select 1 from public.order_ops_options o where o.kind = v.kind and o.label = v.label);
