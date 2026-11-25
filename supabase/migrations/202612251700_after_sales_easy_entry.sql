-- ฟอร์มรอของ/ซ่อม/คืน กรอกง่าย (เจ้าของเลือก 2026-11-25 ข้อ 1-7)
-- ① ปุ่มตัวเลือกตั้งค่าได้: วิธีแก้ · ชนิดของคืน · เหตุผลคืน · ข้อความลัดรอของ
alter table public.order_ops_options drop constraint if exists order_ops_options_kind_check;
alter table public.order_ops_options add constraint order_ops_options_kind_check
  check (kind in ('instruction_command','repair_topic','engrave_special','engrave_font','engrave_sku_type','engrave_sku_pos','command_choice','command_phrase','special_wrap','card_phrase',
                  'repair_resolution','return_type','return_reason','wait_phrase'));

insert into public.order_ops_options (kind, label, sort_order)
select v.kind, v.label, v.sort_order from (values
  ('repair_resolution', 'ซ่อม', 1), ('repair_resolution', 'เปลี่ยนสินค้าชิ้นใหม่', 2), ('repair_resolution', 'เปลี่ยนรุ่นสินค้า', 3),
  ('repair_resolution', 'เปลี่ยนไซส์', 4), ('repair_resolution', 'ส่งสินค้าเพิ่ม', 5), ('repair_resolution', 'ผลิตใหม่', 6),
  ('return_type', 'คืนเงิน', 1), ('return_type', 'เปลี่ยนสินค้า', 2), ('return_type', 'ตีกลับ (ส่งไม่ถึง)', 3),
  ('return_reason', 'สินค้ามีตำหนิ', 1), ('return_reason', 'ส่งผิด', 2), ('return_reason', 'ไม่ตรงปก', 3), ('return_reason', 'ลูกค้าเปลี่ยนใจ', 4),
  ('wait_phrase', 'รอสีนี้เข้า', 1), ('wait_phrase', 'รอไซส์นี้เข้า', 2), ('wait_phrase', 'รอผลิตเพิ่ม', 3)
) as v(kind, label, sort_order)
where not exists (select 1 from public.order_ops_options o where o.kind = v.kind and o.label = v.label);

-- ② ช่องใหม่ (ว่างได้ทั้งหมด ไม่กระทบข้อมูลเดิม)
alter table public.after_sales_cases
  add column if not exists platform text,
  add column if not exists return_type text,
  add column if not exists return_reason text,
  add column if not exists refund_amount numeric(12,2),
  add column if not exists refund_bank text,
  add column if not exists refund_account text,
  add column if not exists refund_account_name text;
alter table public.order_waitlist add column if not exists expected_at date;
