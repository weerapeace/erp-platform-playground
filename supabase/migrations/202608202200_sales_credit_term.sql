-- ============================================================
-- เครดิตลูกค้า — ใช้รูปแบบเดียวกับเครดิตร้านค้า
-- ------------------------------------------------------------
-- เจ้าของขอ: "ฝั่งลูกค้าใช้ดรอปดาวน์เหมือนฝั่งร้านค้า"
--
-- ปัญหาเดิม: เครดิตลูกค้าเก็บเป็น partners_v2.payment_terms_days (ตัวเลขจำนวนวันล้วน)
-- จึงบอกได้แค่ "กี่วัน" — บอก "สิ้นเดือน" หรือ "ทุกวันที่ 25" ไม่ได้
-- ทั้งที่ลูกค้าองค์กรส่วนใหญ่จ่ายเป็นรอบ (วางบิลสิ้นเดือน จ่ายวันที่ 25 ฯลฯ)
--
-- แก้โดยเพิ่มช่องข้อความแบบเดียวกับ purchase_credit_term → ใช้ lib/credit-term ตัวเดียวกันทั้งสองฝั่ง
-- ของเดิม payment_terms_days ยังอยู่ (ไม่ลบ) และยังใช้เป็นค่าสำรองถ้าช่องใหม่ว่าง
-- ============================================================

alter table public.partners_v2 add column if not exists sales_credit_term text;

comment on column public.partners_v2.sales_credit_term is
  'เครดิตที่ให้ลูกค้า — รูปแบบเดียวกับ purchase_credit_term (immediate | days:N | eom | monthday:N | monthday_next:N) ใช้ผ่าน lib/credit-term';

-- ย้ายค่าเดิมที่เป็นจำนวนวันมาใส่ช่องใหม่ (ตอนนี้มีอยู่ 1 ราย)
update public.partners_v2
   set sales_credit_term = 'days:' || payment_terms_days
 where sales_credit_term is null
   and coalesce(payment_terms_days, 0) > 0;
