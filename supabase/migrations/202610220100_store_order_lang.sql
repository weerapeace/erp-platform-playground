-- 🌐 เว็บ 2 ภาษา ก้อน 6 — ออเดอร์/คำขอแจ้งของเข้า จำภาษาของลูกค้า
-- เหตุผล: ลูกค้าที่สั่งจากหน้า /en ต้องได้ข้อความแจ้ง (อีเมล/ข้อความที่ร้านคัดลอกไปส่ง) เป็นภาษาอังกฤษ
--         และหน้าตามออเดอร์/ประวัติสั่งซื้อต้องโชว์ชื่อสินค้าภาษาเดียวกับที่ลูกค้าเห็นตอนสั่ง
-- ไม่กระทบของเดิม: ออเดอร์เก่า = 'th' · ชื่ออังกฤษว่าง = ใช้ชื่อไทย (พนักงานยังเห็นชื่อไทยเหมือนเดิม)

alter table public.store_orders
  add column if not exists lang text not null default 'th';
alter table public.store_orders drop constraint if exists store_orders_lang_check;
alter table public.store_orders add constraint store_orders_lang_check check (lang in ('th', 'en'));

-- ชื่อสินค้า/ตัวเลือก ภาษาอังกฤษ ณ ตอนสั่ง (snapshot เหมือนช่องไทย)
alter table public.store_order_items
  add column if not exists name_en text,
  add column if not exists variant_label_en text;

alter table public.store_restock_requests
  add column if not exists lang text not null default 'th';
alter table public.store_restock_requests drop constraint if exists store_restock_requests_lang_check;
alter table public.store_restock_requests add constraint store_restock_requests_lang_check check (lang in ('th', 'en'));
