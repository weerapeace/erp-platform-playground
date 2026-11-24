-- งานหลังขาย รอบ 3: รหัสท้าย SKU บอกรูปแบบ/ตำแหน่งสลัก (เจ้าของเลือก 2026-11-24 · ข้อ 5 = ตั้งเองได้)
-- WK45-05G/2 → G = ฟอยทอง · /2 = ตรงกลาง · ค่าเริ่มต้นตรวจกับข้อมูลแอปเก่า 70 ออเดอร์
alter table public.order_ops_options add column if not exists value text;

alter table public.order_ops_options drop constraint if exists order_ops_options_kind_check;
alter table public.order_ops_options add constraint order_ops_options_kind_check
  check (kind in ('instruction_command','repair_topic','engrave_special','engrave_font','engrave_sku_type','engrave_sku_pos'));

insert into public.order_ops_options (kind, label, value, sort_order) values
  ('engrave_sku_type', 'D', 'พิมพ์จม', 1),
  ('engrave_sku_type', 'G', 'ฟอยทอง', 2),
  ('engrave_sku_type', 'N', 'ฟอยเงิน', 3),
  ('engrave_sku_pos', '1', 'มุมขวา', 1),
  ('engrave_sku_pos', '2', 'ตรงกลาง', 2)
on conflict (kind, label) do nothing;
