-- ============================================================
-- 📧 สินค้าจากเมลแพลตฟอร์ม: ยืนยัน "ระดับรุ่น (ไม่แยกสี)" — 2026-11-01
-- ทำไม: เมล Lazada ไม่บอกสีเลย → ถ้าบังคับเลือกสีเดียว ระบบจะจำไว้และนับทุกออเดอร์ต่อไปเป็นสีนั้น (ข้อมูลรายสีผิด)
--       จึงให้ยืนยันว่า "ขายรุ่น BSD07 แต่ไม่รู้สี" แยกจาก "ยังไม่ได้จับคู่"
-- 1) กฎที่จำไว้ (platform_email_sku_rules) ชี้ได้ 2 แบบ: SKU (สีชัด) หรือ รุ่น parent_skus_v2 (ไม่แยกสี) — อย่างใดอย่างหนึ่ง
-- 2) รายการสินค้าในออเดอร์ (platform_order_items) + matched_parent_sku_id = ผูกระดับรุ่น (matched_sku_id ยังว่าง → ไม่ตัดสต๊อกรายสี)
-- ============================================================

alter table public.platform_email_sku_rules alter column sku_id drop not null;
alter table public.platform_email_sku_rules
  add column if not exists parent_sku_id uuid references public.parent_skus_v2(id) on delete cascade;
alter table public.platform_email_sku_rules drop constraint if exists platform_email_sku_rules_target_chk;
alter table public.platform_email_sku_rules
  add constraint platform_email_sku_rules_target_chk check ((sku_id is not null) <> (parent_sku_id is not null));
comment on column public.platform_email_sku_rules.parent_sku_id is 'ยืนยันระดับรุ่น (ไม่แยกสี) — ใช้เมื่อเมลไม่บอกสี เช่น Lazada · มีค่านี้ = sku_id ว่าง';

alter table public.platform_order_items
  add column if not exists matched_parent_sku_id uuid references public.parent_skus_v2(id) on delete set null;
comment on column public.platform_order_items.matched_parent_sku_id is 'ผูกระดับรุ่น (ไม่รู้สี) — จากเมลแพลตฟอร์มที่ไม่บอกสี · matched_sku_id ยังว่าง (ไม่ตัดสต๊อกรายสี)';
create index if not exists idx_platform_order_items_matched_parent
  on public.platform_order_items (matched_parent_sku_id) where matched_parent_sku_id is not null;
