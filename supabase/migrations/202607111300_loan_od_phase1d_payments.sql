-- Phase 1d: Loan Payments + Allocation (rebuild-from-source) — additive only
-- บันทึกจ่าย (verified) → trigger ตัดยอดเข้าดอกเบี้ย→เงินต้น ทีละงวด (เก่าสุดก่อน) + อัปเดตเงินต้นคงเหลือในสัญญา
-- คำนวณใหม่จากต้นทางเสมอ (loan_contract_reallocate) ตามสเปกข้อ 2.3

-- 1) tables
create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text unique,
  loan_contract_id uuid references public.loan_contracts(id) on delete cascade,
  payment_date date,
  total_paid numeric(18,2) not null default 0,
  withholding_tax numeric(18,2) not null default 0,
  paid_from text not null default '',
  reference_no text not null default '',
  status text not null default 'verified',
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_loan_pay_contract on public.loan_payments(loan_contract_id);

create table if not exists public.loan_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.loan_payments(id) on delete cascade,
  installment_id uuid references public.loan_installments(id) on delete cascade,
  loan_contract_id uuid references public.loan_contracts(id) on delete cascade,
  principal_amount numeric(18,2) not null default 0,
  interest_amount numeric(18,2) not null default 0,
  fee_amount numeric(18,2) not null default 0,
  penalty_amount numeric(18,2) not null default 0,
  total_allocated numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_loan_alloc_payment on public.loan_payment_allocations(payment_id);
create index if not exists idx_loan_alloc_contract on public.loan_payment_allocations(loan_contract_id);

-- 2) numbering + before-trigger
insert into public.erp_numbering_rules(key, label, pattern, reset_policy, current_value, active)
select 'lpay', 'การจ่ายเงินกู้ (Payment)', 'LPAY-{YYYY}-{0000}', 'yearly', 0, true
where not exists (select 1 from public.erp_numbering_rules where key = 'lpay');

create or replace function public.loan_payments_biu() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.payment_no is null or new.payment_no = '' then
    new.payment_no := public.erp_next_number('lpay');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_loan_payments_biu on public.loan_payments;
create trigger trg_loan_payments_biu before insert or update on public.loan_payments
for each row execute function public.loan_payments_biu();

-- 3) reallocate (rebuild): ตัดยอดงวดเก่าสุดก่อน (ดอกเบี้ย→เงินต้น)
create or replace function public.loan_contract_reallocate(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_ver uuid; pay record; inst record;
  remaining numeric(18,2); a_int numeric(18,2); a_pri numeric(18,2); v_newpaid numeric(18,2);
begin
  if p_id is null then return; end if;

  delete from public.loan_payment_allocations where loan_contract_id = p_id;
  update public.loan_installments
    set principal_paid = 0, interest_paid = 0, total_paid = 0, payment_status = 'unpaid'
    where loan_contract_id = p_id;

  select id into v_ver from public.loan_schedule_versions
    where loan_contract_id = p_id and status = 'active' order by version_no desc limit 1;

  for pay in
    select * from public.loan_payments
    where loan_contract_id = p_id and status = 'verified' and is_active = true
    order by payment_date nulls last, payment_no
  loop
    remaining := coalesce(pay.total_paid, 0);
    if v_ver is not null then
      for inst in
        select * from public.loan_installments
        where schedule_version_id = v_ver and is_active = true
        order by installment_no
      loop
        exit when remaining <= 0;
        a_int := least(greatest(inst.interest_due - inst.interest_paid, 0), remaining);
        remaining := remaining - a_int;
        a_pri := least(greatest(inst.principal_due - inst.principal_paid, 0), remaining);
        remaining := remaining - a_pri;
        if a_int + a_pri > 0 then
          insert into public.loan_payment_allocations
            (payment_id, installment_id, loan_contract_id, principal_amount, interest_amount, total_allocated)
          values (pay.id, inst.id, p_id, a_pri, a_int, a_pri + a_int);
          v_newpaid := inst.total_paid + a_int + a_pri;
          update public.loan_installments
            set interest_paid = inst.interest_paid + a_int,
                principal_paid = inst.principal_paid + a_pri,
                total_paid = v_newpaid,
                payment_status = case
                  when v_newpaid >= inst.total_due - 0.005 then 'paid'
                  when v_newpaid > 0 then 'partial' else 'unpaid' end
            where id = inst.id;
        end if;
      end loop;
    end if;
  end loop;

  update public.loan_contracts
    set principal_paid_amount = coalesce((
      select sum(i.principal_paid) from public.loan_installments i
      where i.schedule_version_id = v_ver and i.is_active = true), 0)
    where id = p_id;
  perform public.loan_contract_recompute(p_id);
end $$;

create or replace function public.loan_payments_after() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then perform public.loan_contract_reallocate(old.loan_contract_id); return old; end if;
  perform public.loan_contract_reallocate(new.loan_contract_id);
  if tg_op = 'UPDATE' and old.loan_contract_id is distinct from new.loan_contract_id then
    perform public.loan_contract_reallocate(old.loan_contract_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_loan_payments_after on public.loan_payments;
create trigger trg_loan_payments_after after insert or update or delete on public.loan_payments
for each row execute function public.loan_payments_after();

-- 4) record payment helper
create or replace function public.loan_payment_record(
  p_contract_id uuid, p_payment_date date, p_amount numeric, p_paid_from text default '', p_reference text default ''
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if p_contract_id is null then raise exception 'กรุณาเลือกสัญญา'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'ยอดจ่ายต้องมากกว่า 0'; end if;
  insert into public.loan_payments(loan_contract_id, payment_date, total_paid, paid_from, reference_no, status)
  values (p_contract_id, coalesce(p_payment_date, current_date), p_amount, coalesce(p_paid_from,''), coalesce(p_reference,''), 'verified')
  returning id into v_id;
  return v_id;
end $$;

-- 5) RLS
alter table public.loan_payments enable row level security;
drop policy if exists loan_pay_sel on public.loan_payments;
create policy loan_pay_sel on public.loan_payments for select to authenticated using (true);
alter table public.loan_payment_allocations enable row level security;
drop policy if exists loan_alloc_sel on public.loan_payment_allocations;
create policy loan_alloc_sel on public.loan_payment_allocations for select to authenticated using (true);

-- 6) register module
insert into public.erp_modules(module_key, table_name, label, primary_field, source_type, is_active, sort_order, group_label)
select 'loan-payments', 'loan_payments', 'การจ่ายเงินกู้', 'payment_no', 'physical', true, 540, 'การเงิน'
where not exists (select 1 from public.erp_modules where module_key = 'loan-payments');

-- 7) field registry — payments
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, v.gk,
       v.vis, v.req, v.edit, v.srch, v.filt, v.srt, v.form, v.span, v.ord, v.opts::jsonb, v.rel::jsonb
from public.erp_modules m
cross join (values
  ('id','Id','text','uuid','system', false,false,false,false,false,false, false,1,10,'{}','{}'),
  ('payment_no','เลขที่จ่าย','text','text','core', true,false,false,true,false,true, false,1,20,'{}','{}'),
  ('loan_contract_id','สัญญาเงินกู้','relation','uuid','core', true,true,true,false,true,false, true,2,30,'{}','{"allow_create": false, "target_table": "loan_contracts", "target_module_key": "loan-contracts", "target_label_field": "loan_name", "target_search_fields": ["loan_code","loan_name"]}'),
  ('payment_date','วันที่จ่าย','date','date','core', true,false,true,false,true,true, true,1,40,'{}','{}'),
  ('total_paid','ยอดจ่าย','currency','numeric','other', true,true,true,false,true,true, true,1,50,'{}','{}'),
  ('paid_from','จ่ายจากบัญชี','text','text','other', false,false,true,true,false,false, true,1,60,'{}','{}'),
  ('reference_no','อ้างอิง','text','text','other', false,false,true,true,false,false, true,1,70,'{}','{}'),
  ('withholding_tax','ภาษีหัก ณ ที่จ่าย','currency','numeric','other', false,false,true,false,false,false, true,1,80,'{}','{}'),
  ('status','สถานะ','select','text','status', true,false,true,false,true,false, true,1,90,'{"options":["draft","submitted","verified","cancelled","reversed"]}','{}'),
  ('note','หมายเหตุ','textarea','text','content', false,false,true,false,false,false, true,2,100,'{}','{}')
) as v(fk,lbl,ui,dt,gk,vis,req,edit,srch,filt,srt,form,span,ord,opts,rel)
where m.module_key = 'loan-payments'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 8) installments: add total_paid field (visible)
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options)
select m.id, 'total_paid', 'total_paid', 'จ่ายแล้ว', 'currency', 'numeric', 'other',
       true, false, false, false, false, true, false, 1, 85, '{}'::jsonb
from public.erp_modules m
where m.module_key = 'loan-installments'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'total_paid');

-- 9) menu
insert into public.erp_menu_items
  (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'เงินกู้ & OD', 155, 50, '💸', 'การจ่ายเงิน', '/loan-payments', true, true, array['loan-od'], 'loan-payments', true
where not exists (select 1 from public.erp_menu_items where href = '/loan-payments');

-- 10) permissions
insert into public.erp_permissions(key, label, category, sort_order)
select x.k, x.l, 'การเงิน (เงินกู้/OD)', x.o from (values
  ('loan_payments.view','ดูการจ่ายเงิน',150),
  ('loan_payments.create','บันทึกการจ่าย',160),
  ('loan_payments.edit','แก้ไขการจ่าย',170),
  ('loan_payments.delete','ลบการจ่าย',180)
) as x(k,l,o)
where not exists (select 1 from public.erp_permissions p where p.key = x.k);

insert into public.erp_role_permissions(role_key, permission_key)
select x.r, x.p from (values
  ('manager','loan_payments.view'), ('manager','loan_payments.create'), ('manager','loan_payments.edit'),
  ('staff','loan_payments.view'), ('viewer','loan_payments.view')
) as x(r,p)
where not exists (select 1 from public.erp_role_permissions rp where rp.role_key = x.r and rp.permission_key = x.p);
