-- ============================================================
-- Loan & OD — ตารางผ่อน: เพิ่ม/ลบงวดได้ + วางทั้งใบจาก Excel + ความถี่จ่ายไม่ใช่รายเดือน
-- ------------------------------------------------------------
-- 1) loan_schedule_chain_recompute()  = คิดยอดรวม/เงินต้นต้นงวด-ปลายงวด ต่อเนื่องทั้งตาราง
--                                       (แยกออกมาเป็นของกลาง ใช้ซ้ำได้ทุกทางที่แก้งวด)
-- 2) loan_schedule_apply_manual()     = แก้บางงวด (ของเดิม) — ย้ายมาใช้ helper ข้อ 1
-- 3) loan_schedule_set_rows()         = กำหนดงวด "ทั้งชุด" (เพิ่ม/ลบ/เรียงเลขใหม่)
--                                       ใช้ทั้งปุ่มเพิ่ม-ลบงวด และการวางตารางจาก Excel
-- 4) loan_schedule_generate()         = รองรับความถี่จ่าย ราย 3 เดือน / 6 เดือน / รายปี
-- 5) ทะเบียนฟิลด์: เพิ่มตัวเลือก "ราย 6 เดือน" + แก้คำเตือนเดิมที่บอกว่ายังคิดรายเดือน
-- ============================================================

-- ============================================================
-- 1) คิดโซ่ยอดใหม่ทั้งตาราง
--    ยึดเงินต้นตั้งต้นจาก "สัญญา" (ไม่ใช่จากแถวแรก) — งวดแรกอาจถูกลบ/แทนที่ได้
-- ============================================================
create or replace function public.loan_schedule_chain_recompute(p_version_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_base numeric(18,2); v_open numeric(18,2); inst record;
begin
  if p_version_id is null then return; end if;

  select case when c.contracted_principal > 0 then c.contracted_principal else c.approved_limit end
    into v_base
  from public.loan_schedule_versions v
  join public.loan_contracts c on c.id = v.loan_contract_id
  where v.id = p_version_id;
  if v_base is null then return; end if;

  v_open := v_base;
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
end $$;

comment on function public.loan_schedule_chain_recompute(uuid) is
  'คิดยอดรวมต่องวด + เงินต้นต้นงวด/ปลายงวด ต่อเนื่องใหม่ทั้งตารางผ่อน (ยึดเงินต้นตั้งต้นจากสัญญา)';

-- ============================================================
-- 2) แก้บางงวด (ของเดิม) — เปลี่ยนมาเรียก helper ข้อ 1
-- ============================================================
create or replace function public.loan_schedule_apply_manual(
  p_version_id uuid, p_rows jsonb, p_reason text default ''
) returns int
language plpgsql security definer set search_path to 'public' as $$
declare
  v_contract uuid; r jsonb; v_changed int := 0;
begin
  if p_version_id is null then raise exception 'ไม่ระบุตารางผ่อน'; end if;
  select loan_contract_id into v_contract
    from public.loan_schedule_versions where id = p_version_id;
  if v_contract is null then raise exception 'ไม่พบตารางผ่อน'; end if;

  for r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    update public.loan_installments i
       set due_date      = case when jsonb_exists(r, 'due_date')      then nullif(r->>'due_date','')::date else i.due_date end,
           principal_due = case when jsonb_exists(r, 'principal_due') then greatest(coalesce((r->>'principal_due')::numeric, 0), 0) else i.principal_due end,
           interest_due  = case when jsonb_exists(r, 'interest_due')  then greatest(coalesce((r->>'interest_due')::numeric, 0), 0)  else i.interest_due end,
           fee_due       = case when jsonb_exists(r, 'fee_due')       then greatest(coalesce((r->>'fee_due')::numeric, 0), 0)       else i.fee_due end,
           penalty_due   = case when jsonb_exists(r, 'penalty_due')   then greatest(coalesce((r->>'penalty_due')::numeric, 0), 0)   else i.penalty_due end
     where i.id = (r->>'id')::uuid and i.schedule_version_id = p_version_id;
    if found then v_changed := v_changed + 1; end if;
  end loop;

  perform public.loan_schedule_chain_recompute(p_version_id);

  update public.loan_schedule_versions
     set calculation_method = 'custom', source = 'manual',
         reason = case when coalesce(p_reason,'') <> '' then p_reason else reason end
   where id = p_version_id;

  perform public.loan_contract_reallocate(v_contract);
  return v_changed;
end $$;

-- ============================================================
-- 3) กำหนดงวดทั้งชุด — เพิ่ม / ลบ / เรียงเลขงวดใหม่ในตารางเดิม
--    p_rows = ลำดับในอาร์เรย์ = เลขงวด 1..n
--             แถวที่มี "id" = งวดเดิม (เก็บประวัติการจ่ายไว้) · ไม่มี id = งวดใหม่
--             งวดเดิมที่ไม่ได้ส่งมา = ถูกลบ
--    ใช้กับ: ปุ่มเพิ่ม/ลบงวด · วางตารางจาก Excel ทั้งใบ
-- ============================================================
create or replace function public.loan_schedule_set_rows(
  p_version_id uuid, p_rows jsonb, p_reason text default ''
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_contract uuid; r jsonb; v_id uuid; i int := 0; v_n int;
  v_keep uuid[] := '{}'; v_kept int := 0; v_added int := 0; v_deleted int := 0;
begin
  if p_version_id is null then raise exception 'ไม่ระบุตารางผ่อน'; end if;
  select loan_contract_id into v_contract
    from public.loan_schedule_versions where id = p_version_id;
  if v_contract is null then raise exception 'ไม่พบตารางผ่อน'; end if;

  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_n < 1   then raise exception 'ต้องมีอย่างน้อย 1 งวด'; end if;
  if v_n > 600 then raise exception 'จำนวนงวดต้องไม่เกิน 600 งวด'; end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    i := i + 1;
    v_id := nullif(r->>'id', '')::uuid;

    if v_id is not null and exists (
      select 1 from public.loan_installments
       where id = v_id and schedule_version_id = p_version_id
    ) then
      update public.loan_installments
         set installment_no = i,
             due_date      = nullif(r->>'due_date','')::date,
             principal_due = greatest(coalesce((r->>'principal_due')::numeric, 0), 0),
             interest_due  = greatest(coalesce((r->>'interest_due')::numeric, 0), 0),
             fee_due       = greatest(coalesce((r->>'fee_due')::numeric, fee_due), 0),
             penalty_due   = greatest(coalesce((r->>'penalty_due')::numeric, penalty_due), 0)
       where id = v_id;
      v_kept := v_kept + 1;
    else
      insert into public.loan_installments
        (schedule_version_id, loan_contract_id, installment_no, due_date,
         opening_principal, principal_due, interest_due, fee_due, penalty_due,
         total_due, closing_principal, payment_status)
      values (p_version_id, v_contract, i, nullif(r->>'due_date','')::date,
         0, greatest(coalesce((r->>'principal_due')::numeric, 0), 0),
            greatest(coalesce((r->>'interest_due')::numeric, 0), 0),
            greatest(coalesce((r->>'fee_due')::numeric, 0), 0),
            greatest(coalesce((r->>'penalty_due')::numeric, 0), 0),
         0, 0, 'unpaid')
      returning id into v_id;
      v_added := v_added + 1;
    end if;

    v_keep := v_keep || v_id;
  end loop;

  -- งวดเดิมที่ไม่ได้ส่งมา = ลบทิ้ง (การจัดสรรเงินที่เคยผูกกับงวดนั้นถูกลบตาม FK
  --  แล้วสร้างใหม่จากใบจ่ายทั้งหมดในขั้น reallocate ข้างล่าง)
  delete from public.loan_installments
   where schedule_version_id = p_version_id and not (id = any(v_keep));
  get diagnostics v_deleted = row_count;

  perform public.loan_schedule_chain_recompute(p_version_id);

  update public.loan_schedule_versions
     set calculation_method = 'custom', source = 'manual',
         reason = case when coalesce(p_reason,'') <> '' then p_reason else reason end
   where id = p_version_id;

  perform public.loan_contract_reallocate(v_contract);

  return jsonb_build_object('kept', v_kept, 'added', v_added, 'deleted', v_deleted, 'total', v_n);
end $$;

comment on function public.loan_schedule_set_rows(uuid, jsonb, text) is
  'กำหนดงวดผ่อนทั้งชุดของตารางเวอร์ชันหนึ่ง (เพิ่ม/ลบ/เรียงเลขใหม่) แล้วคิดยอดต่อเนื่อง + ตัดยอดจ่ายใหม่';

-- ============================================================
-- 4) สร้างตารางผ่อน — รองรับความถี่จ่ายที่ไม่ใช่รายเดือน
--    ราย 3 เดือน / 6 เดือน / รายปี → เว้นระยะวันครบกำหนดตามนั้น
--    และคิดดอกเบี้ยต่องวดตามจำนวนเดือนของงวด (ไม่ใช่หารสิบสองเสมอ)
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
  if p_num is null or p_num < 1 then raise exception 'จำนวนงวดต้องมากกว่า 0'; end if;

  -- จำนวนเดือนต่อ 1 งวด ตามความถี่จ่ายในสัญญา (ไม่ระบุ/กำหนดเอง = รายเดือน)
  v_months := case coalesce(v_c.payment_frequency, 'monthly')
                when 'quarterly'  then 3
                when 'semiannual' then 6
                when 'yearly'     then 12
                else 1 end;

  v_principal := case when v_c.contracted_principal > 0 then v_c.contracted_principal else v_c.approved_limit end;
  -- อัตราดอกเบี้ยต่อ "หนึ่งงวด" = อัตราต่อปี × (เดือนต่องวด / 12)
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
-- 5) ทะเบียนฟิลด์ — ความถี่จ่าย: เพิ่ม "ราย 6 เดือน" + คำอธิบายใหม่
-- ============================================================
update public.erp_module_fields f
set options = jsonb_build_object(
      'options', jsonb_build_array('monthly','quarterly','semiannual','yearly','custom'),
      'labels', jsonb_build_object(
        'monthly','รายเดือน',
        'quarterly','ราย 3 เดือน',
        'semiannual','ราย 6 เดือน',
        'yearly','รายปี',
        'custom','กำหนดเอง')),
    help_text = 'ความถี่ที่ต้องจ่ายตามสัญญา · ตัวสร้างตารางผ่อนจะเว้นระยะวันครบกำหนดและคิดดอกเบี้ยต่องวดตามความถี่นี้ให้เอง · เลือก "กำหนดเอง" = ระบบตั้งให้แบบรายเดือน แล้วไปแก้วันครบกำหนดรายงวดเองในปุ่ม "ดูงวดทั้งหมด"'
from public.erp_modules m
where m.id = f.module_id and m.module_key = 'loan-contracts' and f.column_name = 'payment_frequency';
