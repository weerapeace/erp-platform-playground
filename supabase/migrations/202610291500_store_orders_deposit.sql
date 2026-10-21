-- 📦 มัดจำสินค้าพรีออเดอร์ (ชุด 3b · 2026-10-22) — กฎ lib/website-orders depositFor / amountDue
-- deposit_amount = ยอดมัดจำที่ต้องโอนก่อน (null/0 = ออเดอร์ปกติ จ่ายเต็ม) · ที่เหลือ = grand_total - deposit_amount (โอนก่อนจัดส่ง)
-- สถานะชำระใหม่ 'partial' = จ่ายมัดจำแล้ว รอยอดที่เหลือ (payment_status เป็น text อยู่แล้ว ไม่ต้องแก้ constraint)
alter table public.store_orders add column if not exists deposit_amount numeric;
comment on column public.store_orders.deposit_amount is 'มัดจำสินค้าพรีออเดอร์ที่ต้องโอนก่อน (บาท) · null = จ่ายเต็ม · payment_status partial = จ่ายมัดจำแล้ว';
