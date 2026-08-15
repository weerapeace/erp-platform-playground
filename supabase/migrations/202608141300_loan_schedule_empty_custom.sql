-- ============================================================
-- Loan & OD — "ยังไม่รู้ว่ากี่งวด" ก็สร้างตารางผ่อนไว้ก่อนได้
-- ------------------------------------------------------------
-- เจ้าของถาม: "ตรงจำนวนงวด ถ้าไม่รู้ค่อยใส่ได้ไหม"
-- → วิธี 'custom' (กำหนดเอง) ให้ใส่จำนวนงวด = 0 ได้ = สร้าง "ตารางเปล่า"
--   แล้วค่อยไปเพิ่มงวดทีละงวด หรือวางทั้งใบจาก Excel ในปุ่ม "ดูงวดทั้งหมด"
--   (3 วิธีที่คิดด้วยสูตร ยังต้องระบุจำนวนงวดเหมือนเดิม เพราะสูตรต้องใช้)
-- ============================================================
create or replace function public.loan_schedule_generate(
  p_contract_id uuid, p_method text, p_start_date date, p_num int, p_reason text default ''
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_principal numeric(18,2); v_r double precision; v_pay numeric(18,2);
  v_version_id uuid; v_version_no int; v_months int;
  v_open numeric(18,2); v_pri numeric(18,2); v_int numeric(18,2); v_close numeric(18,2);
  v_pri_each numeric(18,2); v_due date; v_dim int; i int;
begin
  select * into v_c from public.loan_contracts where id = p_contract_id;
  if not found then raise exception 'ไม่พบสัญญาเงินกู้'; end if;

  -- จำนวนงวด: 0 ได้เฉพาะ 'custom' (= ตารางเปล่า ไว้เติมงวดเองทีหลัง)
  if p_num is null or p_num < 0 then raise exception 'จำนวนงวดไม่ถูกต้อง'; end if;
  if p_num = 0 and p_method <> 'custom' then
    raise exception 'วิธีนี้ต้องระบุจำนวนงวด (เว้นว่างได้เฉพาะวิธี "กำหนดเอง")';
  end if;

  v_months := case coalesce(v_c.payment_frequency, 'monthly')
                when 'quarterly'  then 3
                when 'semiannual' then 6
                when 'yearly'     then 12
                else 1 end;

  v_principal := case when v_c.contracted_principal > 0 then v_c.contracted_principal else v_c.approved_limit end;
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

  -- ตารางเปล่า → คืนเวอร์ชันไปเลย ยังไม่สร้างงวด
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
