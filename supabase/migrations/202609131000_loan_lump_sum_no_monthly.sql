-- กู้ก้อนเดียวคืนทีเดียว (ตารางผ่อนมี 1 งวด) ไม่ต้องประมาณ "ต้องจ่ายทุกเดือน" (เจ้าของขอ 2026-09-13)
-- เดิม recompute เอาค่างวดเดียวมาเป็นค่าต่อเดือน → หน้าหนี้ธนาคาร/กระแสเงินสดโชว์ ฿200,000 ต่อเดือน ทั้งที่จ่ายครั้งเดียว
-- แก้: ถ้าตารางผ่อนที่ใช้อยู่มีงวดเดียว → estimated_monthly_payment = 0, monthly_estimate_source = 'lump_sum'
create or replace function public.loan_contract_recompute(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_ver uuid; v_months int; v_est numeric(18,2) := 0; v_src text := '';
  v_rate numeric; v_outstanding numeric(18,2); v_freq text;
  v_start date; v_end date; v_term int;
  v_op_pri numeric(18,2); v_op_int numeric(18,2); v_op_n int; v_inst_cnt int := 0;
begin
  if p_id is null then return; end if;

  select coalesce(opening_principal_paid,0), coalesce(opening_interest_paid,0), coalesce(opening_paid_installments,0)
    into v_op_pri, v_op_int, v_op_n
  from public.loan_contracts where id = p_id;

  update public.loan_contracts c
  set principal_paid_amount = t.pri + v_op_pri,
      interest_paid_amount  = t.int_amt + v_op_int
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

  update public.loan_contracts c
  set total_fee_amount    = f.fee_all,
      net_received_amount = greatest(c.total_drawn_amount - f.fee_all, 0)
  from (
    select
      coalesce((select sum(d.fee_amount) from public.loan_drawdowns d
                 where d.loan_contract_id = p_id and d.status = 'confirmed' and d.is_active = true), 0)
    + coalesce((select sum(x.amount) from public.loan_contract_fees x
                 where x.loan_contract_id = p_id and x.is_active = true), 0) as fee_all
  ) f
  where c.id = p_id;

  select id into v_ver from public.loan_schedule_versions
   where loan_contract_id = p_id and status = 'active'
   order by version_no desc limit 1;

  update public.loan_contracts c
  set total_paid_amount       = pay.paid + v_op_pri + v_op_int,
      paid_installment_count  = ins.paid_cnt + v_op_n,
      total_installment_count = case when ins.cnt > 0 then ins.cnt + v_op_n else 0 end,
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

  select start_date, end_date, term_months into v_start, v_end, v_term
  from public.loan_contracts where id = p_id;

  if v_term is not null and v_term > 0 and v_start is not null and v_end is null then
    update public.loan_contracts
      set end_date = (v_start + (v_term || ' month')::interval)::date
    where id = p_id;
  elsif (v_term is null or v_term = 0) and v_start is not null and v_end is not null then
    update public.loan_contracts
      set term_months = greatest((extract(year from age(v_end, v_start)) * 12
                                + extract(month from age(v_end, v_start)))::int, 0)
    where id = p_id;
  end if;

  select coalesce(payment_frequency,'monthly'), coalesce(interest_rate,0), coalesce(outstanding_principal,0)
    into v_freq, v_rate, v_outstanding
  from public.loan_contracts where id = p_id;

  v_months := case v_freq when 'quarterly' then 3 when 'semiannual' then 6 when 'yearly' then 12 else 1 end;

  -- ตารางผ่อนงวดเดียว (คืนก้อนเดียว) → ไม่มี "ต่อเดือน"
  if v_ver is not null then
    select count(*) into v_inst_cnt from public.loan_installments i where i.schedule_version_id = v_ver and i.is_active = true;
  end if;

  if v_inst_cnt = 1 then
    v_est := 0; v_src := 'lump_sum';
  else
    if v_ver is not null then
      select round(avg(i.total_due) / v_months, 2) into v_est
      from public.loan_installments i
      where i.schedule_version_id = v_ver and i.is_active = true and i.payment_status <> 'paid';
      if v_est is not null and v_est > 0 then v_src := 'schedule'; else v_est := 0; end if;
    end if;

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

    if v_est = 0 and v_outstanding > 0 and v_rate > 0 then
      v_est := round(v_outstanding * v_rate / 100.0 / 12.0, 2);
      v_src := 'interest';
    end if;
  end if;

  update public.loan_contracts
    set estimated_monthly_payment = coalesce(v_est, 0),
        monthly_estimate_source   = case when v_src = 'lump_sum' then 'lump_sum' when coalesce(v_est,0) > 0 then v_src else '' end
  where id = p_id;
end $$;

-- คิดใหม่ทุกสัญญาที่เปิดอยู่
do $$
declare c record;
begin
  for c in select id from public.loan_contracts where is_active = true loop
    perform public.loan_contract_recompute(c.id);
  end loop;
end $$;
