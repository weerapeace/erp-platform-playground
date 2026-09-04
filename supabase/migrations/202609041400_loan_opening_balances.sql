-- ยอดยกมา (Opening balances) ของสัญญาเงินกู้ — สำหรับสัญญาเก่าที่ไม่มีใบจ่าย/ตารางผ่อนย้อนหลัง
-- เจ้าของขอ (2026-09-04): "อยากแก้ตรงความคืบหน้าการผ่อนได้ บางทีไม่มีข้อมูลเก่า"
-- หลักการ: ช่องคำนวณ (ผ่อนไปแล้ว/เงินต้นคงเหลือ ฯลฯ) ยังเป็นของระบบ — แต่เพิ่มช่อง "ยกมา" ที่กรอกเองได้
-- แล้ว recompute เอาไปบวก → ตัวเลขถูกตั้งแต่วันแรก และใบจ่ายใหม่ ๆ ยังทับต่อได้ไม่ชนกัน
alter table public.loan_contracts
  add column if not exists opening_principal_paid    numeric(18,2) not null default 0,
  add column if not exists opening_interest_paid     numeric(18,2) not null default 0,
  add column if not exists opening_paid_installments int           not null default 0,
  add column if not exists opening_as_of_date        date;

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text, placeholder)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, 'progress',
       false, false, true, false, true, true, true, 1, v.ord, '{}'::jsonb, '{}'::jsonb, v.help, v.ph
from public.erp_modules m
cross join (values
  ('opening_as_of_date',        'ยอดยกมา ณ วันที่',            'date',     'date',    290,
     'ใช้กับสัญญาเก่าที่ไม่มีใบจ่ายย้อนหลัง — กรอกยอดที่จ่ายไปแล้วก่อนเริ่มใช้ระบบใน 3 ช่องถัดไป ระบบจะเอาไปบวกกับใบจ่ายใหม่ให้เอง', null),
  ('opening_principal_paid',    'เงินต้นที่ชำระแล้ว (ยกมา)',   'currency', 'numeric', 291,
     'เงินต้นที่จ่ายไปแล้วก่อนเริ่มใช้ระบบ · ถ้ารู้แต่ยอดคงเหลือ = เงินต้นตามสัญญา − เงินต้นคงเหลือ', 'เช่น 500,000'),
  ('opening_interest_paid',     'ดอกเบี้ยที่จ่ายแล้ว (ยกมา)',  'currency', 'numeric', 292,
     'ดอกเบี้ยที่จ่ายไปแล้วก่อนเริ่มใช้ระบบ (ไม่รู้ใส่ 0 ได้)', null),
  ('opening_paid_installments', 'ผ่อนไปแล้ว (งวด ยกมา)',       'number',   'integer', 293,
     'จำนวนงวดที่จ่ายไปแล้วก่อนเริ่มใช้ระบบ — ตารางผ่อนที่สร้างในระบบให้ใส่เฉพาะงวดที่เหลือ', 'เช่น 12')
) as v(fk,lbl,ui,dt,ord,help,ph)
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- recompute: บวกยอดยกมาเข้าทุกตัวเลขสะสม
create or replace function public.loan_contract_recompute(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_ver uuid; v_months int; v_est numeric(18,2) := 0; v_src text := '';
  v_rate numeric; v_outstanding numeric(18,2); v_freq text;
  v_start date; v_end date; v_term int;
  v_op_pri numeric(18,2); v_op_int numeric(18,2); v_op_n int;
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

  update public.loan_contracts
    set estimated_monthly_payment = coalesce(v_est, 0),
        monthly_estimate_source   = case when coalesce(v_est,0) > 0 then v_src else '' end
  where id = p_id;
end $$;

-- แก้ยอดยกมา → คิดใหม่ทันที
create or replace function public.loan_contracts_opening_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform public.loan_contract_recompute(new.id);
  return null;
end $$;
drop trigger if exists trg_loan_contracts_opening on public.loan_contracts;
create trigger trg_loan_contracts_opening
after update of opening_principal_paid, opening_interest_paid, opening_paid_installments, opening_as_of_date
on public.loan_contracts
for each row execute function public.loan_contracts_opening_trg();

-- คำอธิบายช่องคำนวณ บอกว่ารวมยอดยกมาแล้ว
update public.erp_module_fields f
   set help_text = case f.column_name
     when 'principal_paid_amount'  then 'เงินต้นที่จ่ายไปแล้ว = ยอดยกมา + จากใบจ่ายที่ยืนยันแล้ว — ระบบคิดให้อัตโนมัติ'
     when 'total_paid_amount'      then 'ยอดจ่ายจริงสะสม (เงินต้น+ดอกเบี้ย) = ยอดยกมา + ใบจ่ายที่ยืนยันแล้ว — ระบบคิดให้อัตโนมัติ'
     when 'paid_installment_count' then 'จำนวนงวดที่จ่ายครบ = งวดยกมา + งวดในตารางผ่อนที่จ่ายแล้ว — ระบบคิดให้อัตโนมัติ'
     when 'outstanding_principal'  then 'เงินต้นที่ยังค้าง = เงินต้นที่ได้รับ − เงินต้นที่ชำระแล้ว (รวมยอดยกมา) · ไม่มีข้อมูลเก่า? กรอกที่ "เงินต้นที่ชำระแล้ว (ยกมา)"'
     else f.help_text end
  from public.erp_modules m
 where m.id = f.module_id and m.module_key = 'loan-contracts'
   and f.column_name in ('principal_paid_amount','total_paid_amount','paid_installment_count','outstanding_principal');
