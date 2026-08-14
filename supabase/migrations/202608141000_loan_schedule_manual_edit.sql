-- ============================================================
-- Loan & OD — ตารางผ่อนแบบ "เงินต้น/ดอกเบี้ยไม่เท่ากันทุกงวด"
-- ------------------------------------------------------------
-- ที่มา: เจ้าของโปรเจกต์แจ้งว่า "ตอนผ่อนบางที เงินต้นกับดอกเบี้ยไม่เท่ากัน"
--        ตารางผ่อนจริงของธนาคารไม่ตรงกับสูตรอัตโนมัติ 3 แบบเดิม
--        → ต้องพิมพ์ยอดจริงรายงวดเองได้
--
-- 1) loan_schedule_generate() รองรับวิธี 'custom' (สร้างตัวตั้งต้นให้ แล้วแก้ยอดเอง)
-- 2) loan_schedule_apply_manual() = บันทึกยอดที่แก้รายงวด แล้วคิดยอดต่อเนื่องใหม่ทั้งตาราง
--    ยึดหลักเดิมของโมดูล: ยอดสรุปทุกตัว "rebuild จากต้นทาง" ไม่กรอกมือ
-- ============================================================

-- ============================================================
-- 1) สร้างตารางผ่อน — เพิ่มวิธี 'custom'
--    custom = ระบบสร้างตัวตั้งต้นแบบผ่อนเท่ากันให้ก่อน (จะได้ไม่ต้องพิมพ์เปล่าทุกช่อง)
--             แล้วผู้ใช้ไปแก้ยอดรายงวดให้ตรงกับของธนาคาร · ที่มา = 'manual'
--    (ตรรกะเดิมของ 3 วิธีคงไว้ครบ ไม่เปลี่ยน)
-- ============================================================
create or replace function public.loan_schedule_generate(
  p_contract_id uuid, p_method text, p_start_date date, p_num int, p_reason text default ''
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_principal numeric(18,2); v_r double precision; v_pay numeric(18,2);
  v_version_id uuid; v_version_no int;
  v_open numeric(18,2); v_pri numeric(18,2); v_int numeric(18,2); v_close numeric(18,2);
  v_pri_each numeric(18,2); v_due date; v_dim int; i int;
begin
  select * into v_c from public.loan_contracts where id = p_contract_id;
  if not found then raise exception 'ไม่พบสัญญาเงินกู้'; end if;
  if p_num is null or p_num < 1 then raise exception 'จำนวนงวดต้องมากกว่า 0'; end if;

  v_principal := case when v_c.contracted_principal > 0 then v_c.contracted_principal else v_c.approved_limit end;
  v_r := coalesce(v_c.interest_rate,0)::double precision / 100.0 / 12.0;

  update public.loan_schedule_versions set status = 'superseded'
   where loan_contract_id = p_contract_id and status = 'active';

  select coalesce(max(version_no),0) + 1 into v_version_no
   from public.loan_schedule_versions where loan_contract_id = p_contract_id;

  insert into public.loan_schedule_versions
    (loan_contract_id, version_no, effective_date, calculation_method, source, reason, status)
  values (p_contract_id, v_version_no, coalesce(p_start_date, current_date), p_method,
          case when p_method = 'custom' then 'manual' else 'system_calculated' end, p_reason, 'active')
  returning id into v_version_id;

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
    v_due := (coalesce(p_start_date, current_date) + (i || ' month')::interval)::date;
    -- ตั้งวันครบกำหนดตาม "ชำระทุกวันที่" ของสัญญา
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

-- ============================================================
-- 2) บันทึกยอดที่แก้เอง รายงวด
--    p_rows = [{"id":"<installment id>","due_date":"2026-09-05",
--               "principal_due":12345.67,"interest_due":890.12,
--               "fee_due":0,"penalty_due":0}, ...]
--    ส่งมาเฉพาะงวดที่แก้ก็ได้ (คีย์ไหนไม่ส่ง = ค่าเดิม)
--    หลังอัปเดต: คิด "ยอดรวมต่อวด" + "เงินต้นต้นงวด/ปลายงวด" ต่อเนื่องใหม่ทั้งตาราง
--                แล้วตัดยอดการจ่ายใหม่จากใบจ่ายทั้งหมด (rebuild-from-source)
-- ============================================================
create or replace function public.loan_schedule_apply_manual(
  p_version_id uuid, p_rows jsonb, p_reason text default ''
) returns int
language plpgsql security definer set search_path to 'public' as $$
declare
  v_contract uuid; r jsonb; inst record;
  v_open numeric(18,2); v_changed int := 0;
begin
  if p_version_id is null then raise exception 'ไม่ระบุตารางผ่อน'; end if;
  select loan_contract_id into v_contract
    from public.loan_schedule_versions where id = p_version_id;
  if v_contract is null then raise exception 'ไม่พบตารางผ่อน'; end if;

  -- 2.1 อัปเดตค่าที่ผู้ใช้แก้ (เฉพาะงวดที่อยู่ในตารางเวอร์ชันนี้เท่านั้น)
  for r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    update public.loan_installments i
       set due_date      = case when jsonb_exists(r, 'due_date')      then nullif(r->>'due_date','')::date            else i.due_date end,
           principal_due = case when jsonb_exists(r, 'principal_due') then greatest(coalesce((r->>'principal_due')::numeric, 0), 0) else i.principal_due end,
           interest_due  = case when jsonb_exists(r, 'interest_due')  then greatest(coalesce((r->>'interest_due')::numeric, 0), 0)  else i.interest_due end,
           fee_due       = case when jsonb_exists(r, 'fee_due')       then greatest(coalesce((r->>'fee_due')::numeric, 0), 0)       else i.fee_due end,
           penalty_due   = case when jsonb_exists(r, 'penalty_due')   then greatest(coalesce((r->>'penalty_due')::numeric, 0), 0)   else i.penalty_due end
     where i.id = (r->>'id')::uuid and i.schedule_version_id = p_version_id;
    if found then v_changed := v_changed + 1; end if;
  end loop;

  -- 2.2 คิดยอดรวมต่องวด + เงินต้นต้นงวด/ปลายงวด ต่อเนื่องใหม่ทั้งตาราง
  --     (งวดแรกยึดเงินต้นตั้งต้นเดิมของตาราง — ไม่ให้แก้ได้ กันยอดเพี้ยน)
  select coalesce(opening_principal, 0) into v_open
    from public.loan_installments
   where schedule_version_id = p_version_id and is_active = true
   order by installment_no limit 1;

  for inst in
    select * from public.loan_installments
     where schedule_version_id = p_version_id and is_active = true
     order by installment_no
  loop
    update public.loan_installments
       set total_due = round(coalesce(inst.principal_due,0) + coalesce(inst.interest_due,0)
                             + coalesce(inst.fee_due,0) + coalesce(inst.penalty_due,0), 2),
           opening_principal = v_open,
           closing_principal = round(v_open - coalesce(inst.principal_due,0), 2)
     where id = inst.id;
    v_open := round(v_open - coalesce(inst.principal_due,0), 2);
  end loop;

  -- 2.3 ตารางนี้ถือเป็น "กำหนดเอง" แล้ว
  update public.loan_schedule_versions
     set calculation_method = 'custom',
         source = 'manual',
         reason = case when coalesce(p_reason,'') <> '' then p_reason else reason end
   where id = p_version_id;

  -- 2.4 ตัดยอดการจ่ายใหม่จากใบจ่ายทั้งหมด → อัปเดตความคืบหน้าในสัญญา
  perform public.loan_contract_reallocate(v_contract);

  return v_changed;
end $$;

comment on function public.loan_schedule_apply_manual(uuid, jsonb, text) is
  'บันทึกยอดผ่อนที่แก้เองรายงวด (เงินต้น/ดอกเบี้ย/ค่าธรรมเนียม/วันครบกำหนด) แล้วคิดยอดต่อเนื่อง + ตัดยอดจ่ายใหม่ทั้งสัญญา';
