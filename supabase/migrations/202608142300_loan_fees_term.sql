-- ============================================================
-- Loan & OD — ค่าธรรมเนียมตอนกู้ (รู้ว่าได้เงินจริงเท่าไหร่) + ระยะเวลาชำระคืน
-- ------------------------------------------------------------
-- เจ้าของขอ:
--   • "เพิ่มรายการค่าธรรมเนียมด้วย จะได้รู้ว่ากู้แล้วได้เงินจริงเท่าไหร่"
--   • "มีกำหนดระยะเวลาชำระคืนหนี้ด้วย"
--
-- ค่าธรรมเนียมมี 2 ที่ที่เกิดได้ ต้องนับให้ครบทั้งคู่ ไม่นับซ้ำ:
--   1) ผูกกับ "ใบเบิกเงิน" (loan_drawdowns.fee_amount) — ที่มีอยู่แล้ว
--   2) ผูกกับ "สัญญา" ตรง ๆ (ตารางใหม่ loan_contract_fees) เช่น ค่าอากรแสตมป์
--      ค่าประเมินหลักประกัน ที่จ่ายตอนทำสัญญา ไม่ได้ผูกกับการเบิกงวดไหน
-- → ได้รับเงินจริง (สุทธิ) = เบิกสะสม − ค่าธรรมเนียมทั้งหมด
-- ============================================================

-- ============================================================
-- 1) รายการค่าธรรมเนียมของสัญญา
-- ============================================================
create table if not exists public.loan_contract_fees (
  id uuid primary key default gen_random_uuid(),
  loan_contract_id uuid references public.loan_contracts(id) on delete cascade,
  charge_type_id uuid references public.loan_charge_types(id) on delete set null,
  label text not null default '',
  amount numeric(18,2) not null default 0,
  fee_date date,
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_loan_contract_fees_contract on public.loan_contract_fees(loan_contract_id);

drop trigger if exists trg_loan_contract_fees_touch on public.loan_contract_fees;
create trigger trg_loan_contract_fees_touch before update on public.loan_contract_fees
for each row execute function public.loan_touch_updated_at();

comment on table public.loan_contract_fees is 'ค่าธรรมเนียมที่เกิดตอนทำสัญญา/ตลอดสัญญา (ไม่ได้ผูกกับใบเบิกใบใดใบหนึ่ง)';

alter table public.loan_contracts
  add column if not exists total_fee_amount     numeric(18,2) not null default 0,
  add column if not exists net_received_amount  numeric(18,2) not null default 0,
  add column if not exists term_months          integer;

comment on column public.loan_contracts.total_fee_amount is 'ค่าธรรมเนียมรวม = ของใบเบิกทุกใบ + ของสัญญา — ระบบคิดให้';
comment on column public.loan_contracts.net_received_amount is 'ได้รับเงินจริง (สุทธิ) = เบิกสะสม − ค่าธรรมเนียมรวม';
comment on column public.loan_contracts.term_months is 'ระยะเวลาชำระคืนตามสัญญา (เดือน) — ใช้เป็นค่าตั้งต้นจำนวนงวดตอนสร้างตารางผ่อน';

-- ============================================================
-- 2) recompute — เพิ่มค่าธรรมเนียม/เงินสุทธิ + เติมวันสิ้นสุดจากระยะเวลา
-- ============================================================
create or replace function public.loan_contract_recompute(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_ver uuid; v_months int; v_est numeric(18,2) := 0; v_src text := '';
  v_rate numeric; v_outstanding numeric(18,2); v_freq text;
  v_start date; v_end date; v_term int;
begin
  if p_id is null then return; end if;

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

  -- ค่าธรรมเนียมรวม (ใบเบิก + ของสัญญา) → เงินที่ได้รับจริง
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

  -- ระยะเวลาชำระคืน ↔ วันสิ้นสุด — เติมให้เฉพาะช่องที่ยังว่าง (ไม่ทับของที่ผู้ใช้กรอกเอง)
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

-- ค่าธรรมเนียมเปลี่ยน → คิดยอดสัญญาใหม่
create or replace function public.loan_contract_fees_rollup() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.loan_contract_recompute(coalesce(new.loan_contract_id, old.loan_contract_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_loan_contract_fees_rollup on public.loan_contract_fees;
create trigger trg_loan_contract_fees_rollup after insert or update or delete on public.loan_contract_fees
for each row execute function public.loan_contract_fees_rollup();

-- ============================================================
-- 3) RLS + ลงทะเบียนโมดูล (ให้ใช้ API กลางได้)
-- ============================================================
alter table public.loan_contract_fees enable row level security;
drop policy if exists loan_contract_fees_sel on public.loan_contract_fees;
create policy loan_contract_fees_sel on public.loan_contract_fees for select to authenticated using (true);

insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'loan-contract-fees', 'loan_contract_fees', 'ค่าธรรมเนียมสัญญาเงินกู้', 'label', 'physical', true, 545, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'loan-contract-fees');

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, 'core',
       v.vis, false, true, v.srch, true, true, true, v.span, v.ord, '{}'::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid', false,false,1,10,'{}'),
  ('loan_contract_id','สัญญาเงินกู้','relation','uuid', true,false,2,20,
   '{"allow_create": false, "target_table": "loan_contracts", "target_module_key": "loan-contracts", "target_label_field": "loan_name", "target_search_fields": ["loan_code","loan_name"], "secondary_label_field": "contract_no"}'),
  ('label','ชื่อรายการ','text','text', true,true,2,30,'{}'),
  ('amount','จำนวนเงิน','currency','numeric', true,false,1,40,'{}'),
  ('fee_date','วันที่','date','date', true,false,1,50,'{}'),
  ('note','หมายเหตุ','text','text', false,false,2,60,'{}')
) as v(fk,lbl,ui,dt,vis,srch,span,ord,rel)
where m.module_key = 'loan-contract-fees'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- ============================================================
-- 4) ทะเบียนฟิลด์ของสัญญา — ค่าธรรมเนียมรวม / ได้รับจริง / ระยะเวลาชำระคืน
-- ============================================================
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, false, v.edit, false, true, true, true, 1, v.ord, '{}'::jsonb, '{}'::jsonb, v.help
from public.erp_modules m
cross join (values
  ('total_fee_amount', 'ค่าธรรมเนียมรวม', 'currency', 'numeric', 'money', true, false, 122,
   'รวมค่าธรรมเนียมของใบเบิกทุกใบ + รายการค่าธรรมเนียมของสัญญา — ระบบคิดให้'),
  ('net_received_amount', 'ได้รับเงินจริง (สุทธิ)', 'currency', 'numeric', 'money', true, false, 124,
   'เบิกสะสม − ค่าธรรมเนียมรวม = เงินที่เข้ากระเป๋าจริง'),
  ('term_months', 'ระยะเวลาชำระคืน (เดือน)', 'number', 'integer', 'period', true, true, 152,
   'กี่เดือนตามสัญญา เช่น 60 — ใส่แล้วระบบเติม "วันสิ้นสุด" ให้ถ้ายังว่าง และใช้เป็นค่าตั้งต้นจำนวนงวดตอนสร้างตารางผ่อน')
) as v(fk, lbl, ui, dt, gk, vis, edit, ord, help)
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- คิดใหม่ให้สัญญาที่มีอยู่ทั้งหมด
do $$
declare r record;
begin
  for r in select id from public.loan_contracts loop
    perform public.loan_contract_recompute(r.id);
  end loop;
end $$;
