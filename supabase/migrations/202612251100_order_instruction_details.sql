-- คำสั่งพิเศษ: กล่องตั้งค่าต่อคำสั่ง + มาจากแชท (เจ้าของเลือก widget 2026-11-25 ข้อ 1-5)
--   command_details = { "<ชื่อคำสั่ง>": { choice?: {กลุ่ม: ค่า}, text?, sku_id?, sku_code?, message? } }
--   via_chat / chat_note = ลูกค้าแจ้งทางแชท (ไม่ได้ลงหมายเหตุในออเดอร์)
alter table public.order_instructions add column if not exists command_details jsonb not null default '{}'::jsonb;
alter table public.order_instructions add column if not exists via_chat boolean not null default false;
alter table public.order_instructions add column if not exists chat_note text;

-- ตัวเลือกของคำสั่ง (เช่น ห่อ › กระดาษ/ริบบิ้น): kind command_choice · label = ตัวเลือก · value = "<คำสั่ง>|<กลุ่ม>"
-- ชนิดกล่องของคำสั่ง: instruction_command.value = choice | card | swap | text | none (ว่าง = ระบบเดาจากชื่อ)
alter table public.order_ops_options drop constraint if exists order_ops_options_kind_check;
alter table public.order_ops_options add constraint order_ops_options_kind_check
  check (kind in ('instruction_command','repair_topic','engrave_special','engrave_font','engrave_sku_type','engrave_sku_pos','command_choice'));

-- ชื่อตัวเลือกซ้ำกันได้ถ้าคนละคำสั่ง/กลุ่ม (เช่น ทอง ทั้งริบบิ้นและกระดาษ)
alter table public.order_ops_options drop constraint if exists order_ops_options_kind_label_key;
drop index if exists public.order_ops_options_kind_label_key;
create unique index if not exists order_ops_options_kind_label_uq on public.order_ops_options (kind, label) where kind <> 'command_choice';
create unique index if not exists order_ops_options_choice_uq on public.order_ops_options (kind, value, label) where kind = 'command_choice';

insert into public.order_ops_options (kind, label, value, sort_order) values
  ('command_choice', 'คราฟท์', 'ห่อ|กระดาษ', 1),
  ('command_choice', 'ลายดอก', 'ห่อ|กระดาษ', 2),
  ('command_choice', 'สีพื้น', 'ห่อ|กระดาษ', 3),
  ('command_choice', 'แดง', 'ห่อ|ริบบิ้น', 11),
  ('command_choice', 'ทอง', 'ห่อ|ริบบิ้น', 12),
  ('command_choice', 'ขาว', 'ห่อ|ริบบิ้น', 13)
on conflict do nothing;
