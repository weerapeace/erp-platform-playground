-- ============================================================
-- เงินกู้ก้อนธรรมดา = "ได้เงินเต็มจำนวนตามสัญญา" อัตโนมัติ (ไม่ต้องลงใบเบิกเอง)
--
-- ปัญหา: เงินต้นคงเหลือ = เบิกสะสม − เงินต้นที่จ่ายแล้ว · สัญญาที่ไม่มีใครลง "ใบเบิก"
-- จะได้เบิกสะสม 0 → คงเหลือติดลบ (KKP −658,879) — ใบเบิกมีความหมายเฉพาะวงเงินหมุนเวียน
--
-- วิธีแก้: ทุกสัญญาที่ loan_type <> 'revolving' และมีเงินต้นตามสัญญา > 0
--   • ถ้ายังไม่มีใบเบิก "รับเงิน" ที่คนลงเอง → ระบบสร้างใบเบิกอัตโนมัติ 1 ใบ (reference_no = 'AUTO')
--     ยอด = เงินต้นตามสัญญา (หรือวงเงินอนุมัติ) · วันที่ = วันเริ่มสัญญา
--   • แก้เงินต้นตามสัญญาภายหลัง → ใบอัตโนมัติปรับยอดตาม
--   • ถ้ามีใบเบิกที่คนลงเองอยู่แล้ว (เช่น ไทยเครดิต) → ไม่ยุ่ง
--   • เปลี่ยนประเภทเป็น revolving → ปิดใบอัตโนมัติ (is_active=false)
-- ใบเบิก "ดอกเบี้ยค้างทบเข้าเงินต้น" จากการปรับโครงสร้าง (reference_no = 'RESTRUCTURE') ไม่นับเป็นใบรับเงิน
-- ============================================================

-- 0) ใบเบิกจากการปรับโครงสร้าง ติดป้ายให้แยกออกจากใบรับเงินได้
update public.loan_drawdowns set reference_no = 'RESTRUCTURE'
 where reference_no = '' and note like 'ดอกเบี้ยค้างทบเข้าเงินต้น%';

create or replace function public.loan_restructure_apply(
  p_contract_id uuid, p_payload jsonb, p_actor uuid default null, p_actor_name text default ''
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_eff date; v_terms jsonb; v_rows jsonb; v_n int;
  v_old_ver uuid; v_old_no int; v_new_ver uuid; v_new_no int;
  v_base numeric(18,2); v_run numeric(18,2); v_i int := 0;
  v_open numeric(18,2); v_cap numeric(18,2); v_fee numeric(18,2);
  v_fee_id uuid; v_dd_id uuid; v_rs_id uuid; v_seq int;
  v_last_due date; r jsonb; inst record;
  v_old_terms jsonb; v_new_terms jsonb; v_kinds text[];
begin
  if p_contract_id is null then raise exception 'ไม่ระบุสัญญา'; end if;
  select * into v_c from public.loan_contracts where id = p_contract_id for update;
  if not found then raise exception 'ไม่พบสัญญาเงินกู้'; end if;

  v_eff := nullif(p_payload->>'effective_date','')::date;
  if v_eff is null then raise exception 'ต้องระบุวันที่มีผล'; end if;

  v_terms := coalesce(p_payload->'terms', '{}'::jsonb);
  v_rows  := coalesce(p_payload->'rows', '[]'::jsonb);
  v_n := jsonb_array_length(v_rows);
  if v_n < 1   then raise exception 'ต้องมีงวดใหม่อย่างน้อย 1 งวด'; end if;
  if v_n > 600 then raise exception 'จำนวนงวดต้องไม่เกิน 600 งวด'; end if;

  v_open := coalesce((p_payload->>'opening_principal')::numeric, 0);
  if v_open <= 0 then raise exception 'เงินต้นตั้งต้น ณ วันมีผล ต้องมากกว่า 0'; end if;
  v_cap := greatest(coalesce((p_payload->>'capitalized_interest')::numeric, 0), 0);
  v_fee := greatest(coalesce((p_payload->>'fee_amount')::numeric, 0), 0);

  select array_agg(x) into v_kinds from jsonb_array_elements_text(coalesce(p_payload->'kinds','[]'::jsonb)) x;
  v_kinds := coalesce(v_kinds, '{}');

  select id, version_no into v_old_ver, v_old_no from public.loan_schedule_versions
   where loan_contract_id = p_contract_id and status = 'active' order by version_no desc limit 1;

  v_old_terms := jsonb_build_object(
    'interest_rate', v_c.interest_rate, 'interest_rate_type', v_c.interest_rate_type,
    'interest_rate_reference', v_c.interest_rate_reference, 'repayment_method', v_c.repayment_method,
    'payment_due_day', v_c.payment_due_day, 'term_months', v_c.term_months, 'end_date', v_c.end_date,
    'estimated_monthly_payment', v_c.estimated_monthly_payment, 'outstanding_principal', v_c.outstanding_principal,
    'total_installment_count', v_c.total_installment_count, 'paid_installment_count', v_c.paid_installment_count,
    'lifecycle_status', v_c.lifecycle_status, 'version_id', v_old_ver, 'version_no', v_old_no);

  select coalesce(max(seq_no),0) + 1 into v_seq from public.loan_restructurings where loan_contract_id = p_contract_id;

  update public.loan_schedule_versions set status = 'superseded'
   where loan_contract_id = p_contract_id and status = 'active';
  select coalesce(max(version_no),0) + 1 into v_new_no from public.loan_schedule_versions where loan_contract_id = p_contract_id;
  insert into public.loan_schedule_versions
    (loan_contract_id, version_no, effective_date, calculation_method, source, reason, status)
  values (p_contract_id, v_new_no, v_eff, 'custom', 'restructure',
          'ปรับโครงสร้างหนี้ ครั้งที่ ' || v_seq || coalesce(' — ' || nullif(p_payload->>'reason',''), ''), 'active')
  returning id into v_new_ver;

  v_base := case when v_c.contracted_principal > 0 then v_c.contracted_principal else v_c.approved_limit end;
  v_run := coalesce(v_base, 0);
  if v_old_ver is not null then
    for inst in
      select * from public.loan_installments
       where schedule_version_id = v_old_ver and is_active = true and due_date < v_eff
       order by installment_no
    loop
      v_i := v_i + 1;
      insert into public.loan_installments
        (schedule_version_id, loan_contract_id, installment_no, due_date,
         opening_principal, principal_due, interest_due, fee_due, penalty_due,
         total_due, closing_principal, payment_status, principal_adjustment)
      values (v_new_ver, p_contract_id, v_i, inst.due_date,
         0, inst.principal_due, inst.interest_due, inst.fee_due, inst.penalty_due,
         0, 0, 'unpaid', coalesce(inst.principal_adjustment,0));
      v_run := round(v_run + coalesce(inst.principal_adjustment,0) - coalesce(inst.principal_due,0), 2);
    end loop;
  end if;

  for r in select value from jsonb_array_elements(v_rows)
  loop
    v_i := v_i + 1;
    if nullif(r->>'due_date','') is null then raise exception 'งวดที่ % ไม่มีวันครบกำหนด', v_i; end if;
    insert into public.loan_installments
      (schedule_version_id, loan_contract_id, installment_no, due_date,
       opening_principal, principal_due, interest_due, fee_due, penalty_due,
       total_due, closing_principal, payment_status, principal_adjustment)
    values (v_new_ver, p_contract_id, v_i, (r->>'due_date')::date,
       0, greatest(coalesce((r->>'principal_due')::numeric,0),0),
          greatest(coalesce((r->>'interest_due')::numeric,0),0),
          greatest(coalesce((r->>'fee_due')::numeric,0),0), 0,
       0, 0, 'unpaid',
       case when v_last_due is null then round(v_open - v_run, 2) else 0 end);
    v_last_due := (r->>'due_date')::date;
  end loop;

  perform public.loan_schedule_chain_recompute(v_new_ver);
  perform public.loan_schedule_version_recompute(v_new_ver);

  if v_cap > 0 then
    insert into public.loan_drawdowns
      (loan_contract_id, drawdown_date, gross_amount, fee_amount, status, reference_no, note)
    values (p_contract_id, v_eff, v_cap, 0, 'confirmed', 'RESTRUCTURE',
            'ดอกเบี้ยค้างทบเข้าเงินต้น — ปรับโครงสร้างหนี้ ครั้งที่ ' || v_seq)
    returning id into v_dd_id;
  end if;

  if v_fee > 0 then
    insert into public.loan_contract_fees (loan_contract_id, label, amount, fee_date, note)
    values (p_contract_id,
            coalesce(nullif(p_payload->>'fee_label',''), 'ค่าธรรมเนียมปรับโครงสร้างหนี้ ครั้งที่ ' || v_seq),
            v_fee, v_eff, coalesce(p_payload->>'bank_ref',''))
    returning id into v_fee_id;
  end if;

  v_new_terms := v_terms || jsonb_build_object(
    'opening_principal', v_open, 'capitalized_interest', v_cap, 'fee_amount', v_fee,
    'new_installment_count', v_n, 'total_installment_count', v_i, 'last_due_date', v_last_due,
    'version_id', v_new_ver, 'version_no', v_new_no);

  insert into public.loan_restructurings
    (loan_contract_id, seq_no, effective_date, kinds, bank_ref, reason, old_terms, new_terms,
     capitalized_interest, fee_amount, fee_id, drawdown_id, old_version_id, new_version_id,
     status, created_by, created_by_name)
  values (p_contract_id, v_seq, v_eff, v_kinds, coalesce(p_payload->>'bank_ref',''), coalesce(p_payload->>'reason',''),
     v_old_terms, v_new_terms, v_cap, v_fee, v_fee_id, v_dd_id, v_old_ver, v_new_ver, 'applied', p_actor, coalesce(p_actor_name,''))
  returning id into v_rs_id;

  update public.loan_contracts set
    interest_rate           = coalesce((v_terms->>'interest_rate')::numeric, interest_rate),
    interest_rate_type      = coalesce(nullif(v_terms->>'interest_rate_type',''), interest_rate_type),
    interest_rate_reference = coalesce(v_terms->>'interest_rate_reference', interest_rate_reference),
    repayment_method        = coalesce(nullif(v_terms->>'repayment_method',''), repayment_method),
    payment_due_day         = coalesce((v_terms->>'payment_due_day')::int, payment_due_day),
    end_date                = coalesce(v_last_due, end_date),
    term_months             = 0,
    restructure_count       = restructure_count + 1,
    last_restructure_date   = v_eff,
    lifecycle_status        = case when lifecycle_status in ('draft','pending_approval','approved','restructuring') then 'active' else lifecycle_status end
  where id = p_contract_id;

  perform public.loan_contract_reallocate(p_contract_id);

  return jsonb_build_object('restructuring_id', v_rs_id, 'seq_no', v_seq,
    'new_version_id', v_new_ver, 'version_no', v_new_no, 'installment_count', v_i, 'new_installments', v_n);
end $$;

-- 1) ใบเบิกอัตโนมัติ --------------------------------------------------------
create or replace function public.loan_contract_auto_drawdown(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_amt numeric(18,2); v_auto uuid; v_manual int;
begin
  select * into v_c from public.loan_contracts where id = p_id;
  if not found then return; end if;

  select id into v_auto from public.loan_drawdowns
   where loan_contract_id = p_id and reference_no = 'AUTO' order by created_at limit 1;

  -- วงเงินหมุนเวียน = ทยอยเบิกจริง → ปิดใบอัตโนมัติถ้ามี
  if v_c.loan_type = 'revolving' then
    if v_auto is not null then update public.loan_drawdowns set is_active = false where id = v_auto; end if;
    return;
  end if;

  v_amt := case when coalesce(v_c.contracted_principal,0) > 0 then v_c.contracted_principal else coalesce(v_c.approved_limit,0) end;
  if v_amt <= 0 then
    if v_auto is not null then update public.loan_drawdowns set is_active = false where id = v_auto; end if;
    return;
  end if;

  -- มีใบรับเงินที่คนลงเองแล้ว (ไม่นับ AUTO / RESTRUCTURE) → ไม่ยุ่ง
  select count(*) into v_manual from public.loan_drawdowns
   where loan_contract_id = p_id and is_active = true and status = 'confirmed'
     and coalesce(reference_no,'') not in ('AUTO','RESTRUCTURE');
  if v_manual > 0 then
    if v_auto is not null then update public.loan_drawdowns set is_active = false where id = v_auto; end if;
    return;
  end if;

  if v_auto is null then
    insert into public.loan_drawdowns
      (loan_contract_id, drawdown_date, gross_amount, fee_amount, status, reference_no, note)
    values (p_id, coalesce(v_c.start_date, current_date), v_amt, 0, 'confirmed', 'AUTO',
            'รับเงินเต็มจำนวนตามสัญญา (ระบบสร้างให้อัตโนมัติ — เงินกู้ก้อนธรรมดาไม่ต้องลงใบเบิกเอง)');
  else
    update public.loan_drawdowns
       set gross_amount = v_amt, is_active = true, status = 'confirmed',
           drawdown_date = coalesce(v_c.start_date, drawdown_date, current_date)
     where id = v_auto
       and (gross_amount <> v_amt or is_active = false or status <> 'confirmed'
            or drawdown_date is distinct from coalesce(v_c.start_date, drawdown_date, current_date));
  end if;
end $$;

-- trigger: เฉพาะตอนค่าที่เกี่ยวเปลี่ยน (กันวนลูปกับ recompute ที่อัปเดตคอลัมน์อื่น)
create or replace function public.loan_contracts_auto_drawdown_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform public.loan_contract_auto_drawdown(new.id);
  return null;
end $$;

drop trigger if exists trg_loan_contracts_auto_drawdown on public.loan_contracts;
create trigger trg_loan_contracts_auto_drawdown
after insert or update of contracted_principal, approved_limit, loan_type, start_date
on public.loan_contracts
for each row execute function public.loan_contracts_auto_drawdown_trg();

-- 2) ทะเบียนฟิลด์: เบิกสะสม/สถานะการเบิก โชว์เฉพาะวงเงินหมุนเวียน · ซ่อนจากตารางเป็นค่าเริ่มต้น ----
update public.erp_module_fields f
   set is_visible = false,
       condition_rules = jsonb_build_object('show_if', jsonb_build_object('field','loan_type','operator','=','value','revolving')),
       help_text = 'ใช้กับวงเงินหมุนเวียน (Revolving) เท่านั้น — เงินกู้ก้อนธรรมดาระบบถือว่าได้เงินเต็มจำนวนตามสัญญาให้อัตโนมัติ'
  from public.erp_modules m
 where m.id = f.module_id and m.module_key = 'loan-contracts'
   and f.column_name in ('total_drawn_amount','drawdown_status');

-- 3) เมนู "การเบิกเงิน" → บอกให้ชัดว่าเฉพาะวงเงินหมุนเวียน
update public.erp_menu_items set label = 'การเบิกเงิน (วงเงินหมุนเวียน)' where href = '/loan-drawdowns' and label = 'การเบิกเงิน';

-- 4) เก็บกวาดข้อมูลเดิม: สร้างใบอัตโนมัติให้สัญญาที่ยังไม่มีใบรับเงิน แล้วคิดยอดใหม่
do $$
declare c record;
begin
  for c in select id from public.loan_contracts where is_active = true loop
    perform public.loan_contract_auto_drawdown(c.id);
    perform public.loan_contract_recompute(c.id);
  end loop;
end $$;
