-- ปฏิทินจัดซื้อ: วันวางแผนจ่ายเงิน + ธง "ติดตาม" (งานเร่ง — เช็กว่าจะเข้าตามคาดไหม)
ALTER TABLE public.purchase_orders_v2 ADD COLUMN IF NOT EXISTS payment_due_date date;
ALTER TABLE public.purchase_orders_v2 ADD COLUMN IF NOT EXISTS follow_up boolean DEFAULT false;
COMMENT ON COLUMN public.purchase_orders_v2.payment_due_date IS 'วันที่วางแผนจ่ายเงิน (ใช้ในปฏิทินจ่ายเงิน)';
COMMENT ON COLUMN public.purchase_orders_v2.follow_up IS 'ติดตามพิเศษ (งานเร่ง — เช็กว่าของจะเข้าตามคาดไหม)';
