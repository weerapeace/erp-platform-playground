-- ลิงก์สั่งซื้อต่อรายการใบขอซื้อ (ใส่จากป๊อปอัป "รายการรอซื้อ")
ALTER TABLE public.purchase_requests_v2 ADD COLUMN IF NOT EXISTS purchase_url text;
COMMENT ON COLUMN public.purchase_requests_v2.purchase_url IS 'ลิงก์สั่งซื้อสินค้า (Taobao/1688/ฯลฯ) ต่อรายการ ใส่จากป๊อปอัปรายการรอซื้อ';
