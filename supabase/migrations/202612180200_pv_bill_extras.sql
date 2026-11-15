-- ============================================================================
-- ใบสำคัญรับ: ค่าส่งในจีน + ค่าธรรมเนียมจ่ายเงิน + ยอดจ่ายจริงตามบิล (2026-11-15)
--   เจ้าของ: "ยอดสุดท้ายไม่ตรงบิล รวมทั้งสิ้นต้องได้ 347.53 (ตามบิล)" — บิล Taobao มี 运费 ¥8 + 支付手续费 ฿10.12 ที่ใบไม่มีที่ใส่
--   seller_ship_foreign = ค่าส่งจากร้าน/ในจีน (สกุลของใบ) · pay_fee_thb = ค่าธรรมเนียมจ่ายเงิน (บาท) — 2 ช่องนี้นับรวมยอดจ่ายร้าน + เฉลี่ยเข้าต้นทุนต่อชิ้นตามมูลค่า
--   paid_total_thb = ยอดจ่ายจริงตามบิล (实付款) ไว้เทียบว่าใบตรงบิลไหม (ไม่ได้บวกเข้ายอด)
--   purchase_delivery_bills.summary = สรุปยอดบิลร้านที่ AI อ่านจาก 付款详情 (ยอดสินค้า/ส่วนลด/ค่าส่ง/ค่าธรรมเนียม/ยอดจ่ายจริง)
-- สูตรกลาง lib/landed-cost computeVoucher · ใบเดิม (ค่าว่าง) = คิดเหมือนเดิมทุกอย่าง
-- ============================================================================
alter table public.purchase_vouchers_v2 add column if not exists seller_ship_foreign numeric(14,4);
alter table public.purchase_vouchers_v2 add column if not exists pay_fee_thb numeric(14,2);
alter table public.purchase_vouchers_v2 add column if not exists paid_total_thb numeric(14,2);
comment on column public.purchase_vouchers_v2.seller_ship_foreign is 'ค่าส่งจากร้าน/ค่าส่งในจีน (运费) สกุลของใบ — รวมในยอดจ่ายร้าน + เฉลี่ยเข้าต้นทุนต่อชิ้น';
comment on column public.purchase_vouchers_v2.pay_fee_thb is 'ค่าธรรมเนียมจ่ายเงิน (支付手续费) เป็นบาท — รวมในยอดจ่ายร้าน + เฉลี่ยเข้าต้นทุนต่อชิ้น';
comment on column public.purchase_vouchers_v2.paid_total_thb is 'ยอดจ่ายจริงตามบิล (实付款) บาท — ไว้เทียบกับยอดใบ ไม่ได้บวกเข้ายอด';

alter table public.purchase_delivery_bills add column if not exists summary jsonb;
comment on column public.purchase_delivery_bills.summary is 'บิลร้าน: สรุปยอดจาก 付款详情 {goods_total, discount_total, discount_in_price, ship, fee, fee_currency, paid_total, paid_currency}';
