-- ============================================================
-- Loan & OD — "ยอดที่ต้องจ่ายทุกเดือน (ประมาณ)" ในสัญญา + บน Dashboard
-- ------------------------------------------------------------
-- เจ้าของขอ: "เพิ่มยอดที่ต้องจ่ายทุกเดือน (ประมาณ) · ต้องไปขึ้นที่ Dashboard ด้วย"
--
-- คิดจาก 3 ทาง ไล่ตามความแม่น (เก็บที่มาไว้ด้วย จะได้รู้ว่าเลขนี้มาจากไหน):
--   1) schedule — มีตารางผ่อน: เฉลี่ยยอดของงวดที่ยังไม่จ่าย ÷ จำนวนเดือนต่องวด
--   2) history  — ไม่มีตาราง แต่เคยจ่าย: ค่ากลางของยอดจ่ายราย 'เดือน' 6 เดือนล่าสุด
--                (รวมทุกใบในเดือนเดียวกันก่อน · ไม่นับเดือนปัจจุบันที่ยังจ่ายไม่ครบ)
--   3) interest — ไม่มีทั้งคู่: ดอกเบี้ยต่อเดือนของเงินต้นคงเหลือ (อย่างน้อยรู้ว่าดอกเท่าไหร่)
-- ============================================================

alter table public.loan_contracts
  add column if not exists estimated_monthly_payment numeric(18,2) not null default 0,
  add column if not exists monthly_estimate_source   text          not null default '';

comment on column public.loan_contracts.estimated_monthly_payment is
  'ยอดที่ต้องจ่ายต่อเดือนโดยประมาณ — ระบบคิดให้ (ตารางผ่อน → ประวัติการจ่าย → ดอกเบี้ยต่อเดือน)';
comment on column public.loan_contracts.monthly_estimate_source is
  'ที่มาของยอดต่อเดือน: schedule | history | interest | (ว่าง = คิดไม่ได้)';

-- ============================================================
-- recompute — เพิ่มการคิดยอดต่อเดือน (ส่วนอื่นคงเดิมครบ)
-- ============================================================
create or replace function public.loan_contract_recompute(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_ver uuid; v_months int; v_est numeric(18,2) := 0; v_src text := '';
  v_rate numeric; v_outstanding numeric(18,2); v_freq text;
begin
  if p_id is null then return; end if;

  -- 1) เงินต้น/ดอกเบี้ยที่จ่ายไปแล้ว — จากใบจ่าย (แยกยอดเอง) หรือจากที่ระบบตัดเข้างวด
  update public.loan_contracts c
  set principal_paid_amount = t.pri,
      interest_paid_amount  = t.int_amt
  from (
    select
      coalesce(sum(case when p.split_sum > 0 then p.principal_amount else coalesce(al.pri, 0) end), 0) as pri,
      coalesce(sum(case when p.split_sum > 0 then p.interest_amount  else coalesce(al.int_amt, 0) end), 0) as int_amt
    from (
      select x.*,
             coalesce(x.principal_amount,0) + coalesce(x.interest_amount,0) + coalesce(x.penalty_amount,0)
             + coalesce(x.fee_amount,0) + coalesce(x.other_amount,0) as split_sum
      from public.loan_payments x
      where x.loan_contract_id = p_id and x.status = 'verified' and x.is_active = true
    ) p
    left join lateral (
      select sum(a.principal_amount) as pri, sum(a.interest_amount) as int_amt
      from public.loan_payment_allocations a
      where a.payment_id = p.id
    ) al on true
  ) t
  where c.id = p_id;

  -- 2) เบิกสะสม / เงินต้นคงเหลือ / สถานะการเบิก
  update public.loan_contracts c
  set total_drawn_amount   = t.drawn,
      outstanding_principal = t.drawn - c.principal_paid_amount,
      drawdown_status = case
        when t.drawn <= 0 then 'not_drawn'
        when t.ref > 0 and t.drawn >= t.ref then 'fully_drawn'
        else 'partially_drawn' end
  from (
    select coalesce(sum(d.gross_amount),0) as drawn,
           case when c2.contracted_principal > 0 then c2.contracted_principal else c2.approved_limit end as ref
    from public.loan_contracts c2
    left join public.loan_drawdowns d
      on d.loan_contract_id = c2.id and d.status = 'confirmed' and d.is_active = true
    where c2.id = p_id
    group by c2.id, c2.contracted_principal, c2.approved_limit
  ) t
  where c.id = p_id;

  select id into v_ver from public.loan_schedule_versions
   where loan_contract_id = p_id and status = 'active'
   order by version_no desc limit 1;

  -- 3) ผ่อนไปแล้วรวม + ความคืบหน้าเชิง "งวด"
  update public.loan_contracts c
  set total_paid_amount       = pay.paid,
      paid_installment_count  = ins.paid_cnt,
      total_installment_count = ins.cnt,
      next_due_date           = ins.next_due,
      next_due_amount         = coalesce(ins.next_amt, 0)
  from (
    select coalesce(sum(x.total_paid),0) as paid
    from public.loan_payments x
    where x.loan_contract_id = p_id and x.status = 'verified' and x.is_active = true
  ) pay,
  (
    select count(*)                                                as cnt,
           count(*) filter (where n.payment_status = 'paid')       as paid_cnt,
           min(n.due_date) filter (where n.payment_status <> 'paid') as next_due,
           (array_agg(greatest(n.total_due - n.total_paid, 0) order by n.due_date nulls last, n.installment_no)
              filter (where n.payment_status <> 'paid'))[1]        as next_amt
    from public.loan_installments n
    where n.loan_contract_id = p_id and n.schedule_version_id = v_ver and n.is_active = true
  ) ins
  where c.id = p_id;

  -- 4) ยอดที่ต้องจ่ายทุกเดือน (ประมาณ)
  select coalesce(payment_frequency,'monthly'), coalesce(interest_rate,0), coalesce(outstanding_principal,0)
    into v_freq, v_rate, v_outstanding
  from public.loan_contracts where id = p_id;

  v_months := case v_freq when 'quarterly' then 3 when 'semiannual' then 6 when 'yearly' then 12 else 1 end;

  -- 4.1 มีตารางผ่อน → เฉลี่ยงวดที่ยังไม่จ่าย (แปลงเป็นต่อเดือน)
  if v_ver is not null then
    select round(avg(i.total_due) / v_months, 2) into v_est
    from public.loan_installments i
    where i.schedule_version_id = v_ver and i.is_active = true and i.payment_status <> 'paid';
    if v_est is not null and v_est > 0 then v_src := 'schedule'; else v_est := 0; end if;
  end if;

  -- 4.2 ไม่มีตาราง → ดูจากประวัติ "รายเดือน" (บางเดือนจ่ายหลายใบ ต้องรวมก่อน)
  --     ใช้ค่ากลาง (median) ของ 6 เดือนล่าสุด และ "ไม่นับเดือนปัจจุบัน" ที่ยังจ่ายไม่ครบ
  if v_est = 0 then
    select round(percentile_cont(0.5) within group (order by m.sum_paid)::numeric, 2) into v_est
    from (
      select date_trunc('month', p.payment_date) as mth, sum(p.total_paid) as sum_paid
      from public.loan_payments p
      where p.loan_contract_id = p_id and p.status = 'verified' and p.is_active = true
        and p.payment_date is not null
        and p.payment_date < date_trunc('month', current_date)
      group by 1
      order by 1 desc
      limit 6
    ) m;
    if v_est is not null and v_est > 0 then v_src := 'history'; else v_est := 0; end if;
  end if;

  -- 4.3 ยังไม่มีอะไรเลย → ดอกเบี้ยต่อเดือนของเงินต้นคงเหลือ
  if v_est = 0 and v_outstanding > 0 and v_rate > 0 then
    v_est := round(v_outstanding * v_rate / 100.0 / 12.0, 2);
    v_src := 'interest';
  end if;

  update public.loan_contracts
    set estimated_monthly_payment = coalesce(v_est, 0),
        monthly_estimate_source   = case when coalesce(v_est,0) > 0 then v_src else '' end
  where id = p_id;
end $$;

-- ============================================================
-- ทะเบียนฟิลด์ — โชว์ในหมวด "ความคืบหน้าการผ่อน" (อ่านอย่างเดียว)
-- ============================================================
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, 'estimated_monthly_payment', 'estimated_monthly_payment', 'ต้องจ่ายทุกเดือน (ประมาณ)',
       'currency', 'numeric', 'progress',
       true, false, false, false, true, true, true, 1, 168, '{}'::jsonb, '{}'::jsonb,
       'ระบบคิดให้ — มีตารางผ่อน: เฉลี่ยงวดที่ยังไม่จ่าย · ไม่มีตาราง: ค่ากลางของยอดจ่ายรายเดือน 6 เดือนล่าสุด · ยังไม่เคยจ่าย: ดอกเบี้ยต่อเดือนของเงินต้นคงเหลือ'
from public.erp_modules m
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'estimated_monthly_payment');

-- ============================================================
-- Dashboard — เพิ่มยอดรวมต่อเดือนของทุกสัญญาที่ยังใช้งานอยู่
-- ============================================================
create or replace function public.loan_dashboard() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'as_of', current_date,
    'summary', (
      select jsonb_build_object(
        'active_count', count(*) filter (where lifecycle_status = 'active'),
        'contract_count', count(*),
        'total_outstanding', coalesce(sum(outstanding_principal) filter (where lifecycle_status = 'active'), 0),
        'total_drawn', coalesce(sum(total_drawn_amount), 0),
        'total_paid', coalesce(sum(principal_paid_amount), 0),
        'monthly_estimate', coalesce(sum(estimated_monthly_payment) filter (where lifecycle_status = 'active'), 0),
        'monthly_estimate_count', count(*) filter (where lifecycle_status = 'active' and estimated_monthly_payment > 0)
      ) from public.loan_contracts where is_active
    ),
    'due_30', (
      select coalesce(sum(i.total_due - i.total_paid), 0)
      from public.loan_installments i
      join public.loan_schedule_versions v on v.id = i.schedule_version_id and v.status = 'active'
      where i.is_active and i.payment_status <> 'paid'
        and i.due_date >= current_date and i.due_date < current_date + 30
    ),
    'overdue_amount', (
      select coalesce(sum(i.total_due - i.total_paid), 0)
      from public.loan_installments i
      join public.loan_schedule_versions v on v.id = i.schedule_version_id and v.status = 'active'
      where i.is_active and i.payment_status <> 'paid' and i.due_date < current_date
    ),
    'overdue', (
      select coalesce(jsonb_agg(x.j order by x.due_date), '[]'::jsonb) from (
        select i.due_date, jsonb_build_object(
          'loan_code', c.loan_code, 'loan_name', c.loan_name,
          'installment_no', i.installment_no, 'due_date', i.due_date,
          'amount', i.total_due - i.total_paid) j
        from public.loan_installments i
        join public.loan_schedule_versions v on v.id = i.schedule_version_id and v.status = 'active'
        join public.loan_contracts c on c.id = i.loan_contract_id
        where i.is_active and i.payment_status <> 'paid' and i.due_date < current_date
        order by i.due_date limit 20) x
    ),
    'due_soon', (
      select coalesce(jsonb_agg(x.j order by x.due_date), '[]'::jsonb) from (
        select i.due_date, jsonb_build_object(
          'loan_code', c.loan_code, 'loan_name', c.loan_name,
          'installment_no', i.installment_no, 'due_date', i.due_date,
          'amount', i.total_due - i.total_paid) j
        from public.loan_installments i
        join public.loan_schedule_versions v on v.id = i.schedule_version_id and v.status = 'active'
        join public.loan_contracts c on c.id = i.loan_contract_id
        where i.is_active and i.payment_status <> 'paid'
          and i.due_date >= current_date and i.due_date < current_date + 30
        order by i.due_date limit 20) x
    )
  );
$$;

-- คิดใหม่ให้สัญญาที่มีอยู่ทั้งหมด
do $$
declare r record;
begin
  for r in select id from public.loan_contracts loop
    perform public.loan_contract_recompute(r.id);
  end loop;
end $$;
