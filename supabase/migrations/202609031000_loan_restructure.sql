-- ============================================================
-- ปรับโครงสร้างหนี้ (Loan Restructuring) — เฟส 1
--
-- แนวคิด: "ปรับโครงสร้างหนี้" = เหตุการณ์ 1 ครั้งบนสัญญาเงินกู้ ที่เปลี่ยนเงื่อนไข
-- ตั้งแต่วันมีผล (ดอกเบี้ย/วิธีผ่อน/พักเงินต้น/ทบดอกค้าง/ค่าธรรมเนียม)
--   • เงื่อนไขเก่า + งวดที่จ่ายไปแล้ว ไม่หาย (snapshot ใน loan_restructurings.old_terms)
--   • ตารางผ่อนเวอร์ชันใหม่ = งวดเดิมก่อนวันมีผล (คัดลอก) + งวดใหม่หลังวันมีผล
--     ต้องคัดลอกงวดเก่ามาด้วย เพราะ loan_contract_reallocate ตัดยอด "ใบจ่ายทุกใบ"
--     ลงเวอร์ชันที่ active เท่านั้น — ถ้ามีแต่งวดใหม่ ใบจ่ายเก่าจะไปตัดผิดงวด
--   • เงินต้นตั้งต้นของงวดใหม่ (เงินต้นคงเหลือ ณ วันมีผล + ดอกค้างที่ทบ) ต่างจากยอดที่
--     ไล่ต่อเนื่องจากตารางเดิมได้ → เก็บส่วนต่างไว้ใน loan_installments.principal_adjustment
--     ของงวดใหม่งวดแรก แล้วให้ loan_schedule_chain_recompute บวกเข้าไปตอนไล่ยอด
--   • ดอกเบี้ยค้างที่ทบเข้าเงินต้น → ลงเป็นใบเบิก (loan_drawdowns) 1 ใบ เพื่อให้
--     "เงินต้นคงเหลือ" ของสัญญา (= เบิกสะสม − เงินต้นที่จ่ายแล้ว) ขยับตามจริง
--   • ค่าธรรมเนียมปรับโครงสร้าง (เก็บแยก) → loan_contract_fees 1 แถว
--   • ย้อนกลับได้ (loan_restructure_revert) เฉพาะครั้งล่าสุด · ถ้ามีใบจ่ายหลังวันมีผล
--     ต้องส่ง p_force = true (หน้าจอให้พิมพ์ CONFIRM)
-- ============================================================

-- 1) คอลัมน์ใหม่ ---------------------------------------------------
alter table public.loan_installments
  add column if not exists principal_adjustment numeric(18,2) not null default 0;
comment on column public.loan_installments.principal_adjustment is
  'ปรับเงินต้นตั้งต้นของงวดนี้ (+/−) ก่อนไล่ยอด — ใช้ตอนปรับโครงสร้างหนี้ (ทบดอกค้าง / ยอดจริงต่างจากตาราง)';

alter table public.loan_contracts
  add column if not exists restructure_count int not null default 0,
  add column if not exists last_restructure_date date;

-- 2) ตารางเก็บ "ครั้งที่ปรับโครงสร้าง" ---------------------------------
create table if not exists public.loan_restructurings (
  id uuid primary key default gen_random_uuid(),
  loan_contract_id uuid not null references public.loan_contracts(id) on delete cascade,
  seq_no int not null default 1,
  effective_date date not null,
  kinds text[] not null default '{}',              -- rate_cut / extend / holiday / lower_installment / capitalize / consolidate / other
  bank_ref text not null default '',
  reason text not null default '',
  old_terms jsonb not null default '{}'::jsonb,     -- snapshot เงื่อนไขก่อนปรับ
  new_terms jsonb not null default '{}'::jsonb,     -- เงื่อนไขใหม่ที่ใช้
  capitalized_interest numeric(18,2) not null default 0,
  fee_amount numeric(18,2) not null default 0,
  fee_id uuid,                                      -- loan_contract_fees.id
  drawdown_id uuid,                                 -- loan_drawdowns.id (ดอกทบเข้าต้น)
  old_version_id uuid,                              -- loan_schedule_versions.id ที่ถูกแทนที่
  new_version_id uuid,                              -- loan_schedule_versions.id ที่สร้างใหม่
  status text not null default 'applied',           -- applied | reverted
  created_by uuid,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid,
  is_active boolean not null default true
);
create index if not exists idx_loan_restructurings_contract on public.loan_restructurings(loan_contract_id, seq_no);

alter table public.loan_restructurings enable row level security;
drop policy if exists loan_restructurings_sel on public.loan_restructurings;
create policy loan_restructurings_sel on public.loan_restructurings for select to authenticated using (true);

-- 3) สิทธิ์ใหม่ (admin เท่านั้น — admin override ใน erp_can จึงไม่ต้องผูก role) ----
insert into public.erp_permissions(key, label, category, sort_order, is_dangerous)
select 'loan_contracts.restructure', 'ปรับโครงสร้างหนี้ (เปลี่ยนเงื่อนไขสัญญา)', 'การเงิน (เงินกู้/OD)', 35, true
where not exists (select 1 from public.erp_permissions where key = 'loan_contracts.restructure');

-- 4) ทะเบียนฟิลด์: 2 คอลัมน์ใหม่ในสัญญาเงินกู้ (หมวดความคืบหน้า · อ่านอย่างเดียว) ----
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text, placeholder)
select m.id, v.fk, v.fk, v.lbl, v.ui, v.dt, 'progress',
       true, false, false, false, true, true, true, 1, v.ord, '{}'::jsonb, '{}'::jsonb, v.help, null
from public.erp_modules m
cross join (values
  ('restructure_count',     'ปรับโครงสร้าง (ครั้ง)', 'number', 'integer', 370,
     'จำนวนครั้งที่ปรับโครงสร้างหนี้กับธนาคาร — ระบบนับให้จากแผง "ปรับโครงสร้างหนี้" ในหน้าสัญญา'),
  ('last_restructure_date', 'ปรับโครงสร้างล่าสุด',  'date',   'date',    371,
     'วันมีผลของการปรับโครงสร้างครั้งล่าสุด')
) as v(fk,lbl,ui,dt,ord,help)
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = v.fk);

-- 5) ไล่ยอดต่อเนื่อง — บวก principal_adjustment ก่อนคิดงวด (ของเดิมเริ่มจากเงินต้นตามสัญญาเสมอ) ----
create or replace function public.loan_schedule_chain_recompute(p_version_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
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

-- 6) ทำปรับโครงสร้างหนี้ 1 ครั้ง (ทุกอย่างใน transaction เดียว) -------------------
-- p_payload = {
--   effective_date, kinds[], bank_ref, reason,
--   opening_principal,        -- เงินต้นตั้งต้นของงวดใหม่งวดแรก (รวมดอกทบแล้ว)
--   capitalized_interest,     -- ดอกเบี้ยค้างที่ทบเข้าเงินต้น (0 = ไม่มี)
--   fee_amount, fee_label,    -- ค่าธรรมเนียม (เก็บแยก)
--   terms: { interest_rate, interest_rate_type, interest_rate_reference, repayment_method,
--            payment_due_day, holiday_periods, periods, installment_amount },
--   rows: [ { due_date, principal_due, interest_due, fee_due } ... ]   -- งวดใหม่ (หลังวันมีผล)
-- }
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

  -- เวอร์ชันที่ใช้อยู่ (อาจไม่มี = สัญญายังไม่เคยมีตารางผ่อน)
  select id, version_no into v_old_ver, v_old_no from public.loan_schedule_versions
   where loan_contract_id = p_contract_id and status = 'active' order by version_no desc limit 1;

  -- snapshot เงื่อนไขเดิม
  v_old_terms := jsonb_build_object(
    'interest_rate', v_c.interest_rate, 'interest_rate_type', v_c.interest_rate_type,
    'interest_rate_reference', v_c.interest_rate_reference, 'repayment_method', v_c.repayment_method,
    'payment_due_day', v_c.payment_due_day, 'term_months', v_c.term_months, 'end_date', v_c.end_date,
    'estimated_monthly_payment', v_c.estimated_monthly_payment, 'outstanding_principal', v_c.outstanding_principal,
    'total_installment_count', v_c.total_installment_count, 'paid_installment_count', v_c.paid_installment_count,
    'lifecycle_status', v_c.lifecycle_status, 'version_id', v_old_ver, 'version_no', v_old_no);

  select coalesce(max(seq_no),0) + 1 into v_seq from public.loan_restructurings where loan_contract_id = p_contract_id;

  -- ตารางผ่อนเวอร์ชันใหม่
  update public.loan_schedule_versions set status = 'superseded'
   where loan_contract_id = p_contract_id and status = 'active';
  select coalesce(max(version_no),0) + 1 into v_new_no from public.loan_schedule_versions where loan_contract_id = p_contract_id;
  insert into public.loan_schedule_versions
    (loan_contract_id, version_no, effective_date, calculation_method, source, reason, status)
  values (p_contract_id, v_new_no, v_eff, 'custom', 'restructure',
          'ปรับโครงสร้างหนี้ ครั้งที่ ' || v_seq || coalesce(' — ' || nullif(p_payload->>'reason',''), ''), 'active')
  returning id into v_new_ver;

  -- คัดลอกงวดเดิมที่ครบกำหนดก่อนวันมีผล (ยอดเดิมทุกอย่าง · การจ่ายให้ reallocate ตัดใหม่)
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

  -- งวดใหม่ (งวดแรกใส่ส่วนต่างให้เงินต้นตั้งต้น = ค่าที่ผู้ใช้ยืนยัน)
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

  -- ดอกเบี้ยค้างทบเข้าเงินต้น → ใบเบิก 1 ใบ (ให้เงินต้นคงเหลือของสัญญาขยับตาม)
  if v_cap > 0 then
    insert into public.loan_drawdowns
      (loan_contract_id, drawdown_date, gross_amount, fee_amount, status, note)
    values (p_contract_id, v_eff, v_cap, 0, 'confirmed',
            'ดอกเบี้ยค้างทบเข้าเงินต้น — ปรับโครงสร้างหนี้ ครั้งที่ ' || v_seq)
    returning id into v_dd_id;
  end if;

  -- ค่าธรรมเนียม (เก็บแยก)
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

  -- เงื่อนไขในสัญญา → ค่าใหม่ (ค่าเดิมอยู่ใน old_terms)
  update public.loan_contracts set
    interest_rate           = coalesce((v_terms->>'interest_rate')::numeric, interest_rate),
    interest_rate_type      = coalesce(nullif(v_terms->>'interest_rate_type',''), interest_rate_type),
    interest_rate_reference = coalesce(v_terms->>'interest_rate_reference', interest_rate_reference),
    repayment_method        = coalesce(nullif(v_terms->>'repayment_method',''), repayment_method),
    payment_due_day         = coalesce((v_terms->>'payment_due_day')::int, payment_due_day),
    end_date                = coalesce(v_last_due, end_date),
    term_months             = 0,   -- ให้ recompute คิดใหม่จากวันเริ่ม→วันสิ้นสุด
    restructure_count       = restructure_count + 1,
    last_restructure_date   = v_eff,
    lifecycle_status        = case when lifecycle_status in ('draft','pending_approval','approved','restructuring') then 'active' else lifecycle_status end
  where id = p_contract_id;

  perform public.loan_contract_reallocate(p_contract_id);

  return jsonb_build_object('restructuring_id', v_rs_id, 'seq_no', v_seq,
    'new_version_id', v_new_ver, 'version_no', v_new_no, 'installment_count', v_i, 'new_installments', v_n);
end $$;

-- 7) ย้อนกลับครั้งล่าสุด ---------------------------------------------------
create or replace function public.loan_restructure_revert(p_id uuid, p_force boolean default false, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_r public.loan_restructurings%rowtype; v_latest uuid; v_pay int; v_old jsonb;
  v_cnt int; v_last date;
begin
  select * into v_r from public.loan_restructurings where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการปรับโครงสร้าง'; end if;
  if v_r.status <> 'applied' then raise exception 'รายการนี้ถูกย้อนกลับไปแล้ว'; end if;

  select id into v_latest from public.loan_restructurings
   where loan_contract_id = v_r.loan_contract_id and status = 'applied' order by seq_no desc limit 1;
  if v_latest <> p_id then raise exception 'ย้อนกลับได้เฉพาะครั้งล่าสุดเท่านั้น'; end if;

  select count(*) into v_pay from public.loan_payments
   where loan_contract_id = v_r.loan_contract_id and status = 'verified' and is_active = true
     and payment_date >= v_r.effective_date;
  if v_pay > 0 and not p_force then
    raise exception 'PAYMENTS_AFTER:%', v_pay;   -- หน้าจอจับข้อความนี้ → ขอให้พิมพ์ CONFIRM
  end if;

  -- ตารางผ่อน: เวอร์ชันใหม่ → superseded · เวอร์ชันเก่ากลับมา active
  update public.loan_schedule_versions set status = 'superseded' where id = v_r.new_version_id;
  if v_r.old_version_id is not null then
    update public.loan_schedule_versions set status = 'active' where id = v_r.old_version_id;
  end if;
  if v_r.fee_id is not null then update public.loan_contract_fees set is_active = false where id = v_r.fee_id; end if;
  if v_r.drawdown_id is not null then update public.loan_drawdowns set is_active = false where id = v_r.drawdown_id; end if;

  v_old := v_r.old_terms;
  update public.loan_contracts set
    interest_rate           = coalesce((v_old->>'interest_rate')::numeric, interest_rate),
    interest_rate_type      = coalesce(nullif(v_old->>'interest_rate_type',''), interest_rate_type),
    interest_rate_reference = coalesce(v_old->>'interest_rate_reference', interest_rate_reference),
    repayment_method        = coalesce(nullif(v_old->>'repayment_method',''), repayment_method),
    payment_due_day         = (v_old->>'payment_due_day')::int,
    term_months             = coalesce((v_old->>'term_months')::int, 0),
    end_date                = nullif(v_old->>'end_date','')::date
  where id = v_r.loan_contract_id;

  update public.loan_restructurings
     set status = 'reverted', reverted_at = now(), reverted_by = p_actor
   where id = p_id;

  select count(*), max(effective_date) into v_cnt, v_last from public.loan_restructurings
   where loan_contract_id = v_r.loan_contract_id and status = 'applied';
  update public.loan_contracts set restructure_count = v_cnt, last_restructure_date = v_last
   where id = v_r.loan_contract_id;

  perform public.loan_contract_reallocate(v_r.loan_contract_id);
  return jsonb_build_object('ok', true, 'payments_after', v_pay);
end $$;
