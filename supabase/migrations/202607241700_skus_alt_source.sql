-- แหล่งซื้อที่ 2 ต่อ SKU (บางทีซื้ออีกร้าน คนละสกุล) — เติมจากป๊อป "เติม/แก้ข้อมูล"
ALTER TABLE public.skus_v2 ADD COLUMN IF NOT EXISTS alt_seller text;
ALTER TABLE public.skus_v2 ADD COLUMN IF NOT EXISTS alt_price numeric;
ALTER TABLE public.skus_v2 ADD COLUMN IF NOT EXISTS alt_currency text;
ALTER TABLE public.skus_v2 ADD COLUMN IF NOT EXISTS alt_link text;
COMMENT ON COLUMN public.skus_v2.alt_seller IS 'แหล่งซื้อที่ 2: ชื่อร้าน';
COMMENT ON COLUMN public.skus_v2.alt_price IS 'แหล่งซื้อที่ 2: ราคาต่อหน่วย';
COMMENT ON COLUMN public.skus_v2.alt_currency IS 'แหล่งซื้อที่ 2: สกุลของราคา (THB/YUAN)';
COMMENT ON COLUMN public.skus_v2.alt_link IS 'แหล่งซื้อที่ 2: ลิงก์สั่งซื้อ';
