-- 🧵 Belt Builder ก้อน 4 — รายการในออเดอร์เว็บอ้างถึง "แบบเข็มขัด" ที่ลูกค้าออกแบบ
-- store_order_items.belt_design_id → belt_designs.id (ลบแบบ = ตั้งว่าง ไม่ลบรายการออเดอร์)
-- ตอนสร้างออเดอร์ (lib/website-orders.ts): belt_designs.status = 'ordered' + order_ref = เลขที่ออเดอร์เว็บ
-- ตรวจแล้ว: store_order_items มีอยู่แล้ว (ตารางออเดอร์เว็บ) → ใช้ add column if not exists ตามกฎ migration_if_not_exists_trap

alter table public.store_order_items add column if not exists belt_design_id uuid references public.belt_designs(id) on delete set null;
create index if not exists store_order_items_belt_design_idx on public.store_order_items (belt_design_id) where belt_design_id is not null;
comment on column public.store_order_items.belt_design_id is 'Belt Builder: แบบเข็มขัดที่ลูกค้าออกแบบ (belt_designs) — รายการ "เข็มขัดสั่งทำ"';
