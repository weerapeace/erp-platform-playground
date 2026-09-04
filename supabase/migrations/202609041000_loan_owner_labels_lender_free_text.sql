-- ป้ายตัวเลือก "เจ้าของหนี้เป็น" ให้อ่านง่าย: หนี้ส่วนตัว / ของบริษัท (เจ้าของขอ 2026-09-04)
-- + ช่อง "ผู้ให้กู้" ของสัญญาเงินกู้ พิมพ์ชื่อเจ้าหนี้ที่ไม่ใช่ธนาคารได้ (options.picker_free_text)
update public.erp_module_fields f
   set options = jsonb_build_object('options', jsonb_build_array('company','person'),
                 'labels', jsonb_build_object('company','ของบริษัท', 'person','หนี้ส่วนตัว')),
       help_text = 'หนี้ส่วนตัว = กู้ในนามบุคคล (ใส่ชื่อในช่องถัดไป) · ของบริษัท = กู้ในนามบริษัทในกลุ่ม (เลือกบริษัท)'
  from public.erp_modules m
 where m.id = f.module_id and m.module_key in ('loan-contracts','od-facilities') and f.column_name = 'owner_type';

update public.erp_module_fields f
   set options = coalesce(f.options,'{}'::jsonb) || jsonb_build_object('picker_free_text', true),
       help_text = 'เลือกธนาคารจากทะเบียนกลาง หรือพิมพ์ชื่อผู้ให้กู้ที่ไม่ใช่ธนาคาร (บุคคล / บริษัทอื่น / ลีสซิ่ง) แล้วกด "✏️ ใช้ชื่อตามที่พิมพ์"'
  from public.erp_modules m
 where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'lender_name';

-- ช่อง "บริษัท" โชว์เสมอ — หนี้ส่วนตัวก็เลือกได้ว่าเอาไปใช้กับบริษัทไหน (เจ้าของขอ 2026-09-04)
update public.erp_module_fields f
   set condition_rules = '{}'::jsonb,
       help_text = 'บริษัทในกลุ่มที่ใช้เงินก้อนนี้ — เลือกได้ทั้งหนี้ของบริษัทและหนี้ส่วนตัวที่เอามาใช้ในบริษัท'
  from public.erp_modules m
 where m.id = f.module_id and m.module_key in ('loan-contracts','od-facilities') and f.column_name = 'company_id';
