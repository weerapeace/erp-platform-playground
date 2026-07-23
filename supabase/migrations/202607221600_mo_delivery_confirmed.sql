-- แยก "นัดส่งลูกค้าจริง" ออกจาก "แค่ deadline งาน" (ใช้คู่กับ due_date)
-- delivery_confirmed = true → ยืนยันนัดส่งลูกค้าแล้ว (โชว์เน้นสีแดงในปฏิทินผลิต)
ALTER TABLE public.manufacturing_orders ADD COLUMN IF NOT EXISTS delivery_confirmed boolean DEFAULT false;
COMMENT ON COLUMN public.manufacturing_orders.delivery_confirmed IS 'ยืนยันนัดส่งลูกค้าแล้ว (true) vs แค่ deadline งาน (false) — ใช้คู่กับ due_date';
