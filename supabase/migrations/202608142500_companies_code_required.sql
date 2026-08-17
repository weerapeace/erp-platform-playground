-- ============================================================
-- ทะเบียนบริษัท — "รหัส" เป็นช่องบังคับ (DB บังคับอยู่แล้ว แต่ฟอร์มไม่ได้บอก)
-- ------------------------------------------------------------
-- เจ้าของเจอ: กด "+ เพิ่มรายการใหม่" ในช่องเลือกบริษัท กรอกชื่อบริษัทแล้ว
--            แต่เด้ง "มีช่องที่จำเป็นถูกเว้นว่าง" โดยไม่บอกว่าช่องไหน
--
-- สาเหตุ: companies.company_code เป็น NOT NULL และไม่มีค่า default
--         แต่ทะเบียนฟิลด์ตั้ง is_required = false → ฟอร์มไม่ขึ้นดาวแดง
--         และตัวตรวจฝั่งจอปล่อยผ่าน ไปตายที่ฐานข้อมูล
--
-- แก้ที่ต้นเหตุ: ตั้งให้ตรงกับความจริงของตาราง + ใส่คำอธิบายว่าต้องกรอกอะไร
-- (ข้อความ error ฝั่ง API ก็แก้ให้บอกชื่อช่องที่ขาดแล้ว — ของกลาง ใช้ได้ทุกโมดูล)
-- ============================================================

update public.erp_module_fields f
set is_required = true,
    help_text = coalesce(nullif(f.help_text,''), 'รหัสย่อของบริษัท เช่น ISG, LOUIS — ใช้อ้างอิงในเอกสารและต้องไม่ซ้ำ'),
    placeholder = coalesce(nullif(f.placeholder,''), 'เช่น ISG')
from public.erp_modules m
where m.id = f.module_id
  and m.module_key = 'payroll-companies'
  and f.column_name = 'company_code';

-- ============================================================
-- ตรวจเจอว่าเป็นปัญหาร่วมของทั้งระบบ ไม่ใช่แค่บริษัท —
-- 16 ช่องใน 11 โมดูลที่ตาราง NOT NULL (ไม่มี default) แต่ทะเบียนบอกว่า "ไม่บังคับ"
-- เช่น material-groups.code/name · payroll-employees.employee_code/last_name ·
--      payroll-contracts.contract_no/wage_type/start_date · platforms.code/name_th ฯลฯ
-- ตั้งให้ตรงกับความจริงของตาราง → ฟอร์มขึ้นดาวแดง + เตือนก่อนบันทึก
--
-- ปลอดภัย: PATCH (แก้ทีละช่อง) เช็กเฉพาะ "ส่งมาแล้วเว้นว่าง" ไม่ได้บังคับให้ส่งครบทุกครั้ง
--          และไม่แตะคอลัมน์ที่มี DB default (บูลีน ฯลฯ) ตามบทเรียนเดิมของ partners-v2
-- ============================================================
update public.erp_module_fields f
set is_required = true
from public.erp_modules m,
     information_schema.columns c
where m.id = f.module_id
  and c.table_schema = 'public' and c.table_name = m.table_name and c.column_name = f.column_name
  and m.is_active and f.is_active and f.show_in_form
  and c.is_nullable = 'NO' and c.column_default is null
  and f.is_required = false
  and f.column_name <> 'id';
