-- ============================================================
-- Loan & OD — แยกยอดจ่ายเป็น เงินต้น / ดอกเบี้ย / ดอกเบี้ยผิดนัด / ค่าธรรมเนียม
--              + โชว์เลขที่บัญชี (เลขที่สัญญาธนาคาร) คู่กับชื่อสัญญาทุกที่
-- ------------------------------------------------------------
-- ที่มา (เจ้าของแจ้งจากฟอร์มบันทึกการจ่าย):
--   "ยอดจ่ายแบ่งออกเป็น จำนวนรวมทั้งหมด · เงินต้น · ดอกเบี้ย · ดอกเบี้ยผิดนัดชำระ · ค่าธรรมเนียม"
--   "ชื่อสัญญา ให้เพิ่มหมายเลขบัญชีด้วย"
--
-- เดิมใบจ่ายเก็บแค่ยอดรวม แล้วระบบเดาเองว่าตัดดอกเบี้ยก่อนแล้วเงินต้น
-- ตอนนี้ใส่ตามใบเสร็จธนาคารได้ตรง ๆ (ถ้าไม่ใส่ ระบบยังเดาให้เหมือนเดิม)
-- ============================================================

-- ============================================================
-- 1) คอลัมน์ใหม่
-- ============================================================
alter table public.loan_payments
  add column if not exists principal_amount numeric(18,2) not null default 0,
  add column if not exists interest_amount  numeric(18,2) not null default 0,
  add column if not exists penalty_amount   numeric(18,2) not null default 0,
  add column if not exists fee_amount       numeric(18,2) not null default 0;

comment on column public.loan_payments.principal_amount is 'ส่วนที่เป็นเงินต้นตามใบเสร็จธนาคาร — เว้น 0 ทั้ง 4 ช่อง = ให้ระบบตัดดอกเบี้ยก่อนแล้วเงินต้นให้เอง';
comment on column public.loan_payments.penalty_amount is 'ดอกเบี้ยผิดนัดชำระ';

-- งวดผ่อน: เก็บว่าจ่ายค่าธรรมเนียม/ดอกผิดนัดของงวดนั้นไปแล้วเท่าไหร่
alter table public.loan_installments
  add column if not exists fee_paid     numeric(18,2) not null default 0,
  add column if not exists penalty_paid numeric(18,2) not null default 0;

-- ============================================================
-- 2) ตัดยอดใหม่ทั้งสัญญา — รองรับยอดที่แยกมาแล้ว
--    มีการแยก (4 ช่องรวมกัน > 0) → ตัดตามช่อง: ดอกเข้าดอก เงินต้นเข้าเงินต้น
--                                    ค่าธรรมเนียมเข้าค่าธรรมเนียม ดอกผิดนัดเข้าดอกผิดนัด
--    ไม่แยก → พฤติกรรมเดิม: ยอดรวมก้อนเดียว ตัดดอกเบี้ยก่อนแล้วเงินต้น (งวดเก่าสุดก่อน)
-- ============================================================
create or replace function public.loan_contract_reallocate(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_ver uuid; pay record; inst record;
  v_split boolean;
  r_int numeric(18,2); r_pri numeric(18,2); r_fee numeric(18,2); r_pen numeric(18,2); r_pool numeric(18,2);
  a_int numeric(18,2); a_pri numeric(18,2); a_fee numeric(18,2); a_pen numeric(18,2);
  v_newpaid numeric(18,2);
begin
  if p_id is null then return; end if;

  delete from public.loan_payment_allocations where loan_contract_id = p_id;
  update public.loan_installments
    set principal_paid = 0, interest_paid = 0, fee_paid = 0, penalty_paid = 0,
        total_paid = 0, payment_status = 'unpaid'
    where loan_contract_id = p_id;

  select id into v_ver from public.loan_schedule_versions
    where loan_contract_id = p_id and status = 'active' order by version_no desc limit 1;
  if v_ver is null then
    update public.loan_contracts set principal_paid_amount = 0 where id = p_id;
    perform public.loan_contract_recompute(p_id);
    return;
  end if;

  for pay in
    select * from public.loan_payments
    where loan_contract_id = p_id and status = 'verified' and is_active = true
    order by payment_date nulls last, payment_no
  loop
    v_split := (coalesce(pay.principal_amount,0) + coalesce(pay.interest_amount,0)
                + coalesce(pay.fee_amount,0) + coalesce(pay.penalty_amount,0)) > 0;

    if v_split then
      r_int := coalesce(pay.interest_amount,0);
      r_pri := coalesce(pay.principal_amount,0);
      r_fee := coalesce(pay.fee_amount,0);
      r_pen := coalesce(pay.penalty_amount,0);
      r_pool := 0;
    else
      r_int := 0; r_pri := 0; r_fee := 0; r_pen := 0;
      r_pool := coalesce(pay.total_paid, 0);
    end if;

    for inst in
      select * from public.loan_installments
      where schedule_version_id = v_ver and is_active = true
      order by installment_no
    loop
      exit when (r_int + r_pri + r_fee + r_pen + r_pool) <= 0;

      if v_split then
        a_int := least(greatest(inst.interest_due  - inst.interest_paid,  0), r_int); r_int := r_int - a_int;
        a_pri := least(greatest(inst.principal_due - inst.principal_paid, 0), r_pri); r_pri := r_pri - a_pri;
        a_fee := least(greatest(inst.fee_due       - inst.fee_paid,       0), r_fee); r_fee := r_fee - a_fee;
        a_pen := least(greatest(inst.penalty_due   - inst.penalty_paid,   0), r_pen); r_pen := r_pen - a_pen;
      else
        -- เดิม: ก้อนเดียว ดอกเบี้ยก่อน แล้วเงินต้น
        a_int := least(greatest(inst.interest_due - inst.interest_paid, 0), r_pool); r_pool := r_pool - a_int;
        a_pri := least(greatest(inst.principal_due - inst.principal_paid, 0), r_pool); r_pool := r_pool - a_pri;
        a_fee := 0; a_pen := 0;
      end if;

      if a_int + a_pri + a_fee + a_pen > 0 then
        insert into public.loan_payment_allocations
          (payment_id, installment_id, loan_contract_id, principal_amount, interest_amount,
           fee_amount, penalty_amount, total_allocated)
        values (pay.id, inst.id, p_id, a_pri, a_int, a_fee, a_pen, a_pri + a_int + a_fee + a_pen);

        v_newpaid := inst.total_paid + a_int + a_pri + a_fee + a_pen;
        update public.loan_installments
          set interest_paid  = inst.interest_paid  + a_int,
              principal_paid = inst.principal_paid + a_pri,
              fee_paid       = inst.fee_paid       + a_fee,
              penalty_paid   = inst.penalty_paid   + a_pen,
              total_paid     = v_newpaid,
              payment_status = case
                when v_newpaid >= inst.total_due - 0.005 then 'paid'
                when v_newpaid > 0 then 'partial' else 'unpaid' end
          where id = inst.id;
      end if;
    end loop;
  end loop;

  update public.loan_contracts
    set principal_paid_amount = coalesce((
      select sum(i.principal_paid) from public.loan_installments i
      where i.schedule_version_id = v_ver and i.is_active = true), 0)
    where id = p_id;
  perform public.loan_contract_recompute(p_id);
end $$;

-- ============================================================
-- 3) บันทึกการจ่าย — รับยอดที่แยกมาแล้ว (ไม่ส่งมา = 0 = ให้ระบบเดาเหมือนเดิม)
-- ============================================================
-- ต้องทิ้งตัวเดิม (5 พารามิเตอร์) ก่อน ไม่งั้นจะกลายเป็น overload แล้วเรียกแบบ named param จะกำกวม
drop function if exists public.loan_payment_record(uuid, date, numeric, text, text);

create or replace function public.loan_payment_record(
  p_contract_id uuid, p_payment_date date, p_amount numeric,
  p_paid_from text default '', p_reference text default '',
  p_principal numeric default 0, p_interest numeric default 0,
  p_penalty numeric default 0, p_fee numeric default 0
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_split numeric(18,2);
begin
  if p_contract_id is null then raise exception 'กรุณาเลือกสัญญา'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'ยอดจ่ายต้องมากกว่า 0'; end if;

  v_split := greatest(coalesce(p_principal,0),0) + greatest(coalesce(p_interest,0),0)
           + greatest(coalesce(p_penalty,0),0)   + greatest(coalesce(p_fee,0),0);
  if v_split > 0 and abs(v_split - p_amount) > 0.01 then
    raise exception 'ยอดที่แยก (%) ไม่เท่ากับยอดจ่ายรวม (%)', v_split, p_amount;
  end if;

  insert into public.loan_payments(
    loan_contract_id, payment_date, total_paid, paid_from, reference_no, status,
    principal_amount, interest_amount, penalty_amount, fee_amount)
  values (p_contract_id, coalesce(p_payment_date, current_date), p_amount,
          coalesce(p_paid_from,''), coalesce(p_reference,''), 'verified',
          greatest(coalesce(p_principal,0),0), greatest(coalesce(p_interest,0),0),
          greatest(coalesce(p_penalty,0),0),   greatest(coalesce(p_fee,0),0))
  returning id into v_id;
  return v_id;
end $$;

-- ============================================================
-- 4) ทะเบียนฟิลด์ — ช่องใหม่ในใบจ่าย (ชนิด currency → ได้ลูกน้ำอัตโนมัติ)
-- ============================================================
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, v.fk, v.fk, v.lbl, 'currency', 'numeric', 'other',
       v.vis, false, true, false, true, true, true, 1, v.ord, '{}'::jsonb, '{}'::jsonb, v.help
from public.erp_modules m
cross join (values
  ('principal_amount', 'แยกเป็น: เงินต้น',            true,  62, 'ส่วนที่ตัดเงินต้นตามใบเสร็จธนาคาร'),
  ('interest_amount',  'แยกเป็น: ดอกเบี้ย',            true,  64, 'ดอกเบี้ยตามปกติ'),
  ('penalty_amount',   'แยกเป็น: ดอกเบี้ยผิดนัดชำระ',  false, 66, 'ดอกเบี้ยปรับกรณีจ่ายช้า'),
  ('fee_amount',       'แยกเป็น: ค่าธรรมเนียม',        false, 68, 'ค่าธรรมเนียมที่เก็บพร้อมงวด')
) as v(fk, lbl, vis, ord, help)
where m.module_key = 'loan-payments'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- คำอธิบายช่องยอดรวม ให้ชัดว่าความสัมพันธ์กับ 4 ช่องข้างล่างคืออะไร
update public.erp_module_fields f
set help_text = 'ยอดที่จ่ายจริงทั้งก้อน · ถ้าแยกช่องข้างล่าง ผลรวมต้องเท่ากับยอดนี้ · ไม่แยก = ระบบตัดดอกเบี้ยก่อนแล้วเงินต้นให้เอง'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-payments' and f.column_name = 'total_paid';

-- ============================================================
-- 5) ชื่อสัญญาโชว์เลขที่บัญชี (เลขที่สัญญาธนาคาร) ต่อท้ายทุกที่ที่อ้างถึงสัญญา
--    ท่ากลาง: relation_config.secondary_label_field → ตาราง/หน้ารายละเอียดโชว์ "ชื่อ · เลขบัญชี"
-- ============================================================
update public.erp_module_fields f
set relation_config = coalesce(f.relation_config, '{}'::jsonb) || jsonb_build_object('secondary_label_field', 'contract_no')
from public.erp_modules m
where m.id = f.module_id
  and f.column_name = 'loan_contract_id'
  and f.ui_field_type = 'relation'
  and m.module_key in ('loan-drawdowns','loan-payments','loan-installments','loan-schedule-versions');
