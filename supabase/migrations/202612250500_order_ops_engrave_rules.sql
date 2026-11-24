-- งานหลังขาย รอบ 2: กติกาตัวอักษรสลักชื่อ + เลือกฟอนต์ (เจ้าของเลือก 2026-11-24)
-- ตัวพิเศษที่สลักได้ / ฟอนต์ที่เครื่องสลักมี = ตั้งเองได้ใน order_ops_options (ซ่อนแทนลบ)
-- A-Z a-z 0-9 เว้นวรรค สลักได้เสมอ (ล็อกในโค้ด lib/order-ops.ts)

alter table public.order_ops_options drop constraint if exists order_ops_options_kind_check;
alter table public.order_ops_options add constraint order_ops_options_kind_check
  check (kind in ('instruction_command','repair_topic','engrave_special','engrave_font'));

alter table public.order_instructions add column if not exists engrave_font text;

insert into public.order_ops_options (kind, label, sort_order)
select 'engrave_special', x.label, x.ord from unnest(array['&','.','-','♥','★']) with ordinality as x(label, ord)
on conflict (kind, label) do nothing;
insert into public.order_ops_options (kind, label, sort_order) values ('engrave_font', 'Times New Roman', 1)
on conflict (kind, label) do nothing;
