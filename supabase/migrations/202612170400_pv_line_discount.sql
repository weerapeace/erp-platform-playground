-- ============================================================================
-- ส่วนลดรายบรรทัดในใบสำคัญรับ (2026-11-14) — เจ้าของขอ "อยากได้ช่องส่วนลด + สรุปส่วนลดรวม"
--   ใส่ได้ทั้งยอดเงิน (สกุลของใบ) และ % (เจ้าของเลือก "ได้ทั้งคู่")
--   discount_pct มีค่า = คิดจาก % (จำนวน × ราคา × % ÷ 100) · ไม่มี = ใช้ discount (ยอดเงิน)
--   ค่าสินค้าบรรทัด = จำนวน × ราคา − ส่วนลด (สูตรกลาง lib/landed-cost computeVoucher)
--   ราคาที่เขียนกลับ PO/ราคาต่อร้าน/สินค้า ตอนยืนยัน = ราคาก่อนหักส่วนลด (เจ้าของเลือก)
-- ใบเดิมไม่มีส่วนลด (ค่าว่าง) = คิดเหมือนเดิมทุกอย่าง
-- ============================================================================
alter table public.purchase_voucher_lines_v2 add column if not exists discount numeric(14,4);
alter table public.purchase_voucher_lines_v2 add column if not exists discount_pct numeric(7,3);
comment on column public.purchase_voucher_lines_v2.discount is 'ส่วนลดของบรรทัด (ยอดเงิน สกุลของใบ) — ถ้ามี discount_pct ระบบคิดยอดนี้จาก % ให้';
comment on column public.purchase_voucher_lines_v2.discount_pct is 'ส่วนลดเป็น % ของ จำนวน × ราคา (ว่าง = ใช้ discount เป็นยอดเงิน)';
