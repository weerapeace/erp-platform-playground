-- คำสั่งพิเศษ รอบ 2 (เจ้าของเลือก widget 2026-11-25 ข้อ 1-6)
--   extra jsonb ของตัวเลือก: command_choice { sku_id } = ผูกวัสดุห่อกับ SKU (โชว์คงเหลือจากสต๊อกกลาง)
--                           instruction_command { template_group } = การ์ดคำสั่งนี้เปิดกลุ่มแม่แบบไหน
--   kind command_phrase = ข้อความลัด (label = แม่แบบ เช่น "ตัดสายให้สั้นลง {n} {u}" · value = ชื่อคำสั่ง)
--   kind special_wrap   = รหัสสินค้าห่อพิเศษ (label = รหัสรุ่น/SKU ขึ้นต้น เช่น GIFT01)
alter table public.order_ops_options add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.order_ops_options drop constraint if exists order_ops_options_kind_check;
alter table public.order_ops_options add constraint order_ops_options_kind_check
  check (kind in ('instruction_command','repair_topic','engrave_special','engrave_font','engrave_sku_type','engrave_sku_pos','command_choice','command_phrase','special_wrap'));

-- ข้อความลัดซ้ำได้ถ้าคนละคำสั่ง
drop index if exists public.order_ops_options_choice_uq;
create unique index if not exists order_ops_options_choice_uq on public.order_ops_options (kind, value, label) where kind in ('command_choice', 'command_phrase');
drop index if exists public.order_ops_options_kind_label_uq;
create unique index if not exists order_ops_options_kind_label_uq on public.order_ops_options (kind, label) where kind not in ('command_choice', 'command_phrase');

insert into public.order_ops_options (kind, label, value, sort_order) values
  ('command_phrase', 'ตัดสายให้สั้นลง {n} {u}', 'แก้ไซส์เข็มขัด', 1),
  ('command_phrase', 'ตัดให้ได้รูกลาง {n} นิ้ว', 'แก้ไซส์เข็มขัด', 2),
  ('special_wrap', 'GIFT01', null, 1)
on conflict do nothing;

-- ชนิดกล่องตามที่เจ้าของบอก: แก้ไซส์เข็มขัด = ข้อความลัด · ตัดชื่อออก = ไม่มีช่องกรอก
update public.order_ops_options set value = 'phrase' where kind = 'instruction_command' and label = 'แก้ไซส์เข็มขัด' and value is null;
update public.order_ops_options set value = 'none' where kind = 'instruction_command' and label = 'ตัดชื่อออก' and value is null;
