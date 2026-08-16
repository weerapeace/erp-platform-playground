-- ============================================================
-- Loan & OD — ช่อง "ธนาคาร / ผู้ให้กู้" เปลี่ยนจากพิมพ์เอง → เลือกจากทะเบียนธนาคารกลาง
-- ------------------------------------------------------------
-- เจ้าของขอ: "ธนาคาร ขอเป็น pickup · ทำให้ทั้ง module เลย"
--
-- ท่ากลาง: ตั้ง options.picker = 'bank' ในทะเบียนฟิลด์
--   → ฟอร์มกลาง (MasterCRUD) เปลี่ยนช่องข้อความนั้นเป็นตัวเลือกธนาคารกลาง (BankPicker)
--     ค้นหาได้ + เพิ่มธนาคารใหม่เข้าทะเบียนได้ในตัว · ไม่ต้องแก้โค้ดรายหน้า
--   → โมดูลอื่นอยากได้แบบเดียวกันก็แค่ตั้งค่านี้ที่ /admin/schema-sync
--
-- ทำไมสำคัญ: loan_charge_types.lender_name ต้องสะกด "ตรงกับ" loan_contracts.lender_name
-- ไม่งั้นรายการเฉพาะธนาคารจะไม่โผล่ในป๊อปบันทึกการจ่ายเลย
-- ============================================================

update public.erp_module_fields f
set options = coalesce(f.options, '{}'::jsonb) || jsonb_build_object('picker', 'bank'),
    help_text = case f.column_name
      when 'lender_name' then
        case m.module_key
          when 'loan-charge-types' then 'เว้นว่าง = ใช้ได้ทุกธนาคาร · เลือกจากทะเบียนธนาคารกลาง (ชื่อจะตรงกับในสัญญาเสมอ)'
          else 'เลือกจากทะเบียนธนาคารกลาง — ถ้ายังไม่มีในรายการ พิมพ์ชื่อแล้วกด "➕ เพิ่มเข้าทะเบียนธนาคาร" ได้เลย'
        end
      else f.help_text end
from public.erp_modules m
where m.id = f.module_id
  and f.column_name = 'lender_name'
  and f.ui_field_type = 'text'
  and m.module_key in ('loan-contracts', 'loan-charge-types', 'od-facilities');

-- ธนาคารที่ใช้อยู่จริงในสัญญา/วงเงิน OD แต่ยังไม่มีในทะเบียนธนาคาร → เติมให้
-- (ไม่งั้นเปิดฟอร์มมาแล้วเลือกซ้ำของเดิมไม่ได้ ต้องมากดเพิ่มเอง)
insert into public.banks (name, country, is_active, sort_order)
select distinct t.lender_name, 'TH', true, 900
from (
  select lender_name from public.loan_contracts where coalesce(lender_name,'') <> ''
  union
  select lender_name from public.od_facilities  where coalesce(lender_name,'') <> ''
  union
  select lender_name from public.loan_charge_types where coalesce(lender_name,'') <> ''
) t
where not exists (select 1 from public.banks b where lower(b.name) = lower(t.lender_name));
