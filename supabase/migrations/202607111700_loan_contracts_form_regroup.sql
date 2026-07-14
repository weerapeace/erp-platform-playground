-- จัดกลุ่มฟิลด์ฟอร์มสัญญาเงินกู้ให้เป็น section ที่ใช้ง่าย (ใช้คู่กับ config.formLayout='sections')
do $$
declare v_mod uuid;
begin
  select id into v_mod from public.erp_modules where module_key = 'loan-contracts';
  if v_mod is null then return; end if;

  update public.erp_module_fields set group_key = 'money'
   where module_id = v_mod and column_name in
     ('contracted_principal','approved_limit','interest_rate','interest_rate_type','interest_rate_reference','currency','repayment_method','payment_frequency');

  update public.erp_module_fields set group_key = 'period'
   where module_id = v_mod and column_name in ('start_date','end_date','responsible');

  -- สถานะที่ระบบคิดเอง → ไม่โชว์ในฟอร์ม (ยังโชว์ในตาราง)
  update public.erp_module_fields set show_in_form = false
   where module_id = v_mod and column_name in ('drawdown_status','repayment_health','accounting_status');
end $$;
