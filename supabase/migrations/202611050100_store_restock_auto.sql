-- 🔔 "แจ้งฉันเมื่อมีของ" รอบ 2 (2026-10-28 · เจ้าของเลือก: ทุกคน · ส่งอัตโนมัติ · ของหมด + ชุดรอเปิด)
--   1) ชุดมาใหม่ที่ยังไม่เปิด: ฝากแจ้ง "ตอนเปิดขาย" ได้ (drop_id · ไม่มีสินค้า → parent_sku_id ว่างได้ แต่ต้องมีอย่างใดอย่างหนึ่ง)
--   2) สมาชิกกดครั้งเดียว: contact_type 'member' + customer_id (ส่งทาง LINE ที่เข้าระบบไว้ / อีเมลที่ยืนยันแล้ว)
--   3) ส่งอัตโนมัติ (store_settings restock_auto_enabled · รอบตรวจเดียวกับเตือนตะกร้า lib/webshop-reminders-db)
--      → auto_channel = ช่องทางที่ระบบส่งสำเร็จ (email | line) · เบอร์โทร / LINE ID = ร้านยังติดต่อเองเหมือนเดิม
-- ตารางเดิม (202610210100) — เพิ่มคอลัมน์/ขยายเงื่อนไขเท่านั้น ไม่แตะแถวเดิม (ตอนทำมี 0 แถว)

alter table public.store_restock_requests alter column parent_sku_id drop not null;
alter table public.store_restock_requests add column if not exists drop_id uuid references public.store_new_drops(id) on delete cascade;
alter table public.store_restock_requests add column if not exists customer_id uuid references public.store_customers(id) on delete cascade;
alter table public.store_restock_requests add column if not exists auto_channel text;

alter table public.store_restock_requests drop constraint if exists store_restock_requests_contact_type_check;
alter table public.store_restock_requests add constraint store_restock_requests_contact_type_check check (contact_type in ('email', 'phone', 'line', 'member'));
alter table public.store_restock_requests drop constraint if exists store_restock_requests_target_check;
alter table public.store_restock_requests add constraint store_restock_requests_target_check check (parent_sku_id is not null or drop_id is not null);
alter table public.store_restock_requests drop constraint if exists store_restock_requests_auto_channel_check;
alter table public.store_restock_requests add constraint store_restock_requests_auto_channel_check check (auto_channel is null or auto_channel in ('email', 'line'));

create index if not exists store_restock_requests_drop_idx on public.store_restock_requests (drop_id, status) where drop_id is not null;
-- ฝากซ้ำ (ช่องทางเดิม · ชุดเดิม) ขณะยังรออยู่ = ไม่เพิ่มแถวใหม่ (ดัชนีเดิมใช้ parent_sku_id ซึ่งว่างในแถวของชุด)
create unique index if not exists store_restock_requests_drop_dedup_idx
  on public.store_restock_requests (shop_id, drop_id, contact_type, lower(contact))
  where status = 'pending' and drop_id is not null;

comment on column public.store_restock_requests.drop_id is '🆕 ชุดมาใหม่ที่ฝากให้แจ้งตอนเปิดขาย (ว่าง = แจ้งของเข้าของสินค้า parent_sku_id)';
comment on column public.store_restock_requests.customer_id is '👤 สมาชิกที่กดรับแจ้ง (contact_type member) — ส่งทาง LINE ที่เข้าระบบไว้ / อีเมลที่ยืนยันแล้ว';
comment on column public.store_restock_requests.auto_channel is '🤖 ระบบส่งอัตโนมัติสำเร็จทางไหน (email | line) · ว่าง = ยังไม่ส่ง / ร้านติดต่อเอง';
