-- เจ้าของอนุมัติ 2026-10-28: ให้ "จำไม่ได้ว่าจ่ายวันไหน" ได้ (ปุ่ม 🤷 ในป๊อปจ่ายงาน)
-- ปลดแค่ "ห้ามว่าง" · ข้อมูลเดิมไม่ถูกแตะ · default ยังเป็นวันนี้ (CURRENT_DATE)
-- รันบน prod แล้วผ่าน apply_migration (mo_work_orders_dispatch_date_nullable) · รันซ้ำได้ ไม่มีผลข้างเคียง
alter table public.mo_work_orders alter column dispatch_date drop not null;
