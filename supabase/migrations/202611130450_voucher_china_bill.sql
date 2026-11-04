-- ใบสำคัญรับ ← บิลโอนเงินจีน (แอป China Pay) — ออกใบจากบิลที่ลงไว้แล้ว (ป๊อป ＋ ออกใบสำคัญรับ แท็บ "จากบิลโอนเงินจีน")
--   ใช้กันออกใบซ้ำจากบิลเดียวกัน + ให้แอปโอนเงินจีนรู้ว่าบิลไหนออกใบสำคัญแล้ว
--   (shipping_bill_id เดิม = บิลค่าส่งที่ผูกกับใบ · ช่องนี้ = บิลค่าสินค้า)
alter table public.purchase_vouchers_v2 add column if not exists china_bill_id uuid references public.china_bills(id) on delete set null;
create index if not exists purchase_vouchers_v2_china_bill_idx on public.purchase_vouchers_v2 (china_bill_id) where china_bill_id is not null;
