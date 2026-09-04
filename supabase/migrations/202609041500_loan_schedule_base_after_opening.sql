-- ตารางผ่อนต้องเริ่มจาก "เงินต้นหลังหักยอดยกมา" ไม่ใช่เงินต้นเต็มสัญญา
-- (สัญญาเก่าที่กรอกยอดยกมาแล้ว → สร้างตารางผ่อนที่เหลือ 40 งวด ต้องคิดจาก 6 ล้าน ไม่ใช่ 7.5 ล้าน)
-- ของกลางตัวเดียว: loan_schedule_base(contract_id) แล้วให้ generate / chain_recompute / restructure_apply ใช้ร่วมกัน

create or replace function public.loan_schedule_base(p_contract_id uuid)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select greatest(
    (case when c.contracted_principal > 0 then c.contracted_principal else coalesce(c.approved_limit,0) end)
    - coalesce(c.opening_principal_paid, 0), 0)::numeric(18,2)
  from public.loan_contracts c where c.id = p_contract_id
$$;

-- 1) ไล่ยอดต่อเนื่อง
create or replace function public.loan_schedule_chain_recompute(p_version_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_base numeric(18,2); v_open numeric(18,2); inst record; v_cid uuid;
begin
  if p_version_id is null then return; end if;
  select loan_contract_id into v_cid from public.loan_schedule_versions where id = p_version_id;
  if v_cid is null then return; end if;
  v_base := public.loan_schedule_base(v_cid);
  if v_base is null then return; end if;

  v_open := v_base;
  for inst in
    select * from public.loan_installments
     where schedule_version_id = p_version_id and is_active = true
     order by installment_no
  loop
    v_open := round(v_open + coalesce(inst.principal_adjustment, 0), 2);
    update public.loan_installments
       set total_due = round(coalesce(inst.principal_due,0) + coalesce(inst.interest_due,0)
                             + coalesce(inst.fee_due,0) + coalesce(inst.penalty_due,0), 2),
           opening_principal = v_open,
           closing_principal = round(v_open - coalesce(inst.principal_due,0), 2)
     where id = inst.id;
    v_open := round(v_open - coalesce(inst.principal_due,0), 2);
  end loop;
end $$;

-- 2) สร้างตารางผ่อนอัตโนมัติ (เหมือนเดิม เปลี่ยนแค่ v_principal)
create or replace function public.loan_schedule_generate(p_contract_id uuid, p_method text, p_start_date date, p_num integer, p_reason text default ''::text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_principal numeric(18,2); v_r double precision; v_pay numeric(18,2);
  v_version_id uuid; v_version_no int; v_months int;
  v_open numeric(18,2); v_pri numeric(18,2); v_int numeric(18,2); v_close numeric(18,2);
  v_pri_each numeric(18,2); v_due date; v_dim int; i int;
begin
  select * into v_c from public.loan_contracts where id = p_contract_id;
  if not found then raise exception 'ไม่พบสัญญาเงินกู้'; end if;

  if p_num is null or p_num < 0 then raise exception 'จำนวนงวดไม่ถูกต้อง'; end if;
  if p_num = 0 and p_method <> 'custom' then
    raise exception 'วิธีนี้ต้องระบุจำนวนงวด (เว้นว่างได้เฉพาะวิธี "กำหนดเอง")';
  end if;

  v_months := case coalesce(v_c.payment_frequency, 'monthly')
                when 'quarterly'  then 3
                when 'semiannual' then 6
                when 'yearly'     then 12
                else 1 end;

  v_principal := public.loan_schedule_base(p_contract_id);   -- เงินต้นหลังหักยอดยกมา
  if coalesce(v_principal,0) <= 0 and p_num > 0 then raise exception 'เงินต้นที่เหลือเป็น 0 — ตรวจเงินต้นตามสัญญา / ยอดยกมา'; end if;
  v_r := coalesce(v_c.interest_rate,0)::double precision / 100.0 * v_months / 12.0;

  update public.loan_schedule_versions set status = 'superseded'
   where loan_contract_id = p_contract_id and status = 'active';

  select coalesce(max(version_no),0) + 1 into v_version_no
   from public.loan_schedule_versions where loan_contract_id = p_contract_id;

  insert into public.loan_schedule_versions
    (loan_contract_id, version_no, effective_date, calculation_method, source, reason, status)
  values (p_contract_id, v_version_no, coalesce(p_start_date, current_date), p_method,
          case when p_method = 'custom' then 'manual' else 'system_calculated' end, p_reason, 'active')
  returning id into v_version_id;

  if p_num = 0 then return v_version_id; end if;

  v_open := v_principal;
  if p_method in ('equal_installment', 'custom') then
    if v_r > 0 then
      v_pay := round((v_principal::double precision * v_r / (1 - power(1 + v_r, -p_num::double precision)))::numeric, 2);
    else
      v_pay := round(v_principal / p_num, 2);
    end if;
  elsif p_method = 'equal_principal' then
    v_pri_each := round(v_principal / p_num, 2);
  end if;

  for i in 1..p_num loop
    v_due := (coalesce(p_start_date, current_date) + ((i * v_months) || ' month')::interval)::date;
    if v_c.payment_due_day is not null then
      v_dim  := extract(day from (date_trunc('month', v_due::timestamp) + interval '1 month' - interval '1 day'))::int;
      v_due  := (date_trunc('month', v_due::timestamp))::date + (least(v_c.payment_due_day, v_dim) - 1);
    end if;
    v_int := round((v_open::double precision * v_r)::numeric, 2);
    if p_method = 'interest_only' then
      v_pri := case when i = p_num then v_open else 0 end;
    elsif p_method = 'equal_principal' then
      v_pri := case when i = p_num then v_open else v_pri_each end;
    else
      v_pri := case when i = p_num then v_open else round(v_pay - v_int, 2) end;
    end if;
    if v_pri > v_open then v_pri := v_open; end if;
    if v_pri < 0 then v_pri := 0; end if;
    v_close := round(v_open - v_pri, 2);
    insert into public.loan_installments
      (schedule_version_id, loan_contract_id, installment_no, due_date,
       opening_principal, principal_due, interest_due, total_due, closing_principal, payment_status)
    values (v_version_id, p_contract_id, i, v_due,
       v_open, v_pri, v_int, round(v_pri + v_int, 2), v_close, 'unpaid');
    v_open := v_close;
  end loop;

  return v_version_id;
end $$;

-- 3) ปรับโครงสร้างหนี้: v_base ใช้ตัวเดียวกัน (โค้ดส่วนอื่นเหมือน 202609040900)
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

  v_base := public.loan_schedule_base(p_contract_id);
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

-- 4) แก้ยอดยกมาแล้ว ตารางผ่อนที่มีอยู่ต้องไล่ยอดใหม่ด้วย (opening_principal ของทุกงวดขยับ)
create or replace function public.loan_contracts_opening_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_ver uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  select id into v_ver from public.loan_schedule_versions where loan_contract_id = new.id and status = 'active' order by version_no desc limit 1;
  if v_ver is not null then perform public.loan_schedule_chain_recompute(v_ver); end if;
  perform public.loan_contract_recompute(new.id);
  return null;
end $$;
