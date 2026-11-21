-- รวมใบสั่งขายหลายใบเป็นใบเดียว + แยกคืนได้ (เจ้าของสั่ง 2026-11-21 · app/api/so-orders/tidy)
-- ใบที่ถูกรวม = status cancelled + merged_into_id (ชี้ใบหลัก) + merged_from_no (เลขเดิม · order_no เปลี่ยนเป็น "<เลขเดิม>·รวม" ให้เลขว่างใช้ต่อได้)
-- รายการที่ย้ายมา = merged_from_order_id (ใบเดิม) → "แยกคืน" ย้ายกลับได้ครบ
-- additive ล้วน: ผู้เรียกเดิมไม่รู้จักคอลัมน์ใหม่ = null เหมือนเดิม
-- ⚠️ ไม่ใส่ foreign key: FK ตัวที่ 2 ระหว่าง so_order_lines ↔ so_orders ทำให้ select แบบฝัง "so_orders(...)" เดิมทั้งระบบพัง (PGRST201 ambiguous)
alter table public.so_orders add column if not exists merged_into_id uuid;
alter table public.so_orders add column if not exists merged_from_no text;
alter table public.so_order_lines add column if not exists merged_from_order_id uuid;
alter table public.so_order_lines drop constraint if exists so_order_lines_merged_from_order_id_fkey;
alter table public.so_orders drop constraint if exists so_orders_merged_into_id_fkey;
create index if not exists so_orders_merged_into_idx on public.so_orders(merged_into_id) where merged_into_id is not null;
create index if not exists so_order_lines_merged_from_idx on public.so_order_lines(merged_from_order_id) where merged_from_order_id is not null;
