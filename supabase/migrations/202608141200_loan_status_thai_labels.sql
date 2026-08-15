-- ============================================================
-- Loan & OD — ป้ายไทยของช่อง "สถานะ" ที่ยังตกค้างเป็นภาษาอังกฤษ
-- ------------------------------------------------------------
-- เจอจากภาพหน้าจอฟอร์มการเบิกเงินกู้: dropdown สถานะยังโชว์ "confirmed" ดิบ ๆ
-- (ตารางมีป้ายไทยแล้วเพราะหน้าเขียน cellRenderer เอง แต่ "ฟอร์ม/ตัวกรอง/bulk"
--  อ่านจากทะเบียนฟิลด์ options.labels ซึ่งยังไม่ได้ตั้ง)
-- ใช้ท่ากลางเดียวกับ dropdown อื่นทั้งระบบ — ตั้งที่เดียว ได้ครบทุกที่
-- ============================================================

update public.erp_module_fields f
set options = jsonb_build_object(
      'options', jsonb_build_array('draft','submitted','verified','confirmed','cancelled','reversed'),
      'labels', jsonb_build_object(
        'draft','ร่าง',
        'submitted','ส่งตรวจสอบ',
        'verified','ตรวจแล้ว',
        'confirmed','ยืนยันแล้ว',
        'cancelled','ยกเลิก',
        'reversed','กลับรายการ')),
    help_text = coalesce(nullif(f.help_text,''), 'นับยอดเข้าสัญญาเฉพาะใบที่ "ยืนยันแล้ว" เท่านั้น')
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-drawdowns' and f.column_name = 'status';

update public.erp_module_fields f
set options = jsonb_build_object(
      'options', jsonb_build_array('draft','submitted','verified','cancelled','reversed'),
      'labels', jsonb_build_object(
        'draft','ร่าง',
        'submitted','ส่งตรวจสอบ',
        'verified','ยืนยันแล้ว (ตัดยอดงวด)',
        'cancelled','ยกเลิก',
        'reversed','กลับรายการ')),
    help_text = coalesce(nullif(f.help_text,''), 'ระบบจะตัดยอดเข้างวดผ่อนให้เฉพาะใบจ่ายที่ "ยืนยันแล้ว"')
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-payments' and f.column_name = 'status';
