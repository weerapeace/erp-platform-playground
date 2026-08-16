-- ============================================================
-- Loan & OD — ให้ "นำเข้าไฟล์ (Import)" ใช้กับใบจ่ายแบบใหม่ได้ถูกต้อง
-- ------------------------------------------------------------
-- เจ้าของแจ้งจากหน้า Import การจ่ายเงินกู้: "ต้องปรับตรงนี้ด้วย"
--
-- 2 เรื่องที่ขาด:
--   1) ช่อง "แยกเป็น: อื่น ๆ" (other_amount) ไม่มีในทะเบียนฟิลด์ → ไม่โผล่ในคอลัมน์ที่ import ได้
--      ทำให้ยอดแยกไม่มีทางบวกได้ครบถ้าใบนั้นมีค่าอากรแสตมป์/เบี้ยประกัน
--   2) การนำเข้าเขียนลงตารางตรง ๆ (ไม่ผ่านฟังก์ชัน loan_payment_record)
--      → ไม่มีใครตรวจว่า "ยอดที่แยก = ยอดจ่ายรวม" ไฟล์ผิดก็เข้าได้ แล้วตัดยอดงวดเพี้ยน
--      → ย้ายกฎมาไว้ที่ตาราง (trigger) จะได้คุมทุกทาง: import / แก้ในตาราง / API / SQL
-- ============================================================

-- ============================================================
-- 1) ทะเบียนฟิลด์: เพิ่ม "แยกเป็น: อื่น ๆ"
-- ============================================================
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, 'other_amount', 'other_amount', 'แยกเป็น: อื่น ๆ', 'currency', 'numeric', 'other',
       false, false, true, false, true, true, true, 1, 69, '{}'::jsonb, '{}'::jsonb,
       'รายการที่จ่ายจริงแต่ไม่ตัดเข้างวดผ่อน เช่น ค่าอากรแสตมป์ ค่าเบี้ยประกัน'
from public.erp_modules m
where m.module_key = 'loan-payments'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'other_amount');

-- ============================================================
-- 2) กฎ "ยอดที่แยกต้องเท่ากับยอดจ่ายรวม" — คุมที่ตาราง (ทุกทางที่เขียนข้อมูล)
--    แยกครบทุกช่องเป็น 0 = ไม่แยก (ระบบตัดดอกก่อนแล้วเงินต้นให้เอง) → ผ่านปกติ
-- ============================================================
create or replace function public.loan_payments_check_split() returns trigger
language plpgsql set search_path to 'public' as $$
declare v_split numeric(18,2);
begin
  v_split := coalesce(new.principal_amount,0) + coalesce(new.interest_amount,0)
           + coalesce(new.penalty_amount,0)   + coalesce(new.fee_amount,0)
           + coalesce(new.other_amount,0);
  if v_split > 0 and abs(v_split - coalesce(new.total_paid,0)) > 0.01 then
    raise exception 'ยอดที่แยก (เงินต้น+ดอกเบี้ย+ดอกผิดนัด+ค่าธรรมเนียม+อื่นๆ = %) ไม่เท่ากับยอดจ่ายรวม (%) — แก้ให้ตรงกัน หรือเว้นช่องแยกทั้งหมดไว้ว่างเพื่อให้ระบบตัดให้เอง',
      v_split, coalesce(new.total_paid,0);
  end if;
  return new;
end $$;

drop trigger if exists trg_loan_payments_check_split on public.loan_payments;
create trigger trg_loan_payments_check_split
before insert or update of total_paid, principal_amount, interest_amount, penalty_amount, fee_amount, other_amount
on public.loan_payments
for each row execute function public.loan_payments_check_split();

comment on function public.loan_payments_check_split() is
  'กันยอดที่แยกในใบจ่ายไม่ตรงกับยอดจ่ายรวม — คุมทุกทางที่เขียนข้อมูล (import / แก้ในตาราง / API)';
