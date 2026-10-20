-- 🚚 เว็บร้าน: วิธีจัดส่งที่ลูกค้าเลือก + ค่าธรรมเนียมเก็บปลายทาง (เฟส 1 ระบบขนส่ง — เจ้าของสั่ง 2026-10-20)
-- ออเดอร์เก่า = ว่าง/0 (ไม่แตะข้อมูลเดิม) · วิธีจัดส่งของร้านเก็บที่ store_settings key "shipping_methods" (JSON) ไม่ต้องมีตารางใหม่
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (store_orders_shipping_method) 2026-10-20
alter table public.store_orders add column if not exists shipping_method text;
alter table public.store_orders add column if not exists shipping_method_label text;
alter table public.store_orders add column if not exists shipping_box text;
alter table public.store_orders add column if not exists cod_fee numeric not null default 0;
comment on column public.store_orders.shipping_method is 'id วิธีจัดส่งที่ลูกค้าเลือก (store_settings.shipping_methods)';
comment on column public.store_orders.shipping_method_label is 'ชื่อวิธีจัดส่งตอนสั่ง (เก็บไว้แม้ร้านเปลี่ยนชื่อ/ลบวิธีทีหลัง)';
comment on column public.store_orders.shipping_box is 'กล่องที่ระบบแนะนำตามจำนวนชิ้น (เช่น A, B, C)';
comment on column public.store_orders.cod_fee is 'ค่าธรรมเนียมเก็บเงินปลายทาง (รวมใน grand_total แล้ว)';
