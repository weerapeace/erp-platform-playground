-- ============================================================
-- Loan & OD — "วิธีจ่าย" (dropdown)
-- ------------------------------------------------------------
-- เจ้าของขอ: "เพิ่มวิธีจ่ายด้วย เป็น dropdown"
--   • ที่สัญญา = วิธีจ่ายประจำตามข้อตกลง (ใช้เป็นค่าตั้งต้นของใบจ่าย)
--   • ที่ใบจ่าย = ครั้งนั้นจ่ายด้วยวิธีไหนจริง ๆ
-- ============================================================

alter table public.loan_contracts add column if not exists payment_method text not null default '';
alter table public.loan_payments  add column if not exists payment_method text not null default '';

comment on column public.loan_contracts.payment_method is 'วิธีจ่ายประจำตามสัญญา — ใช้เป็นค่าตั้งต้นตอนบันทึกการจ่าย';
comment on column public.loan_payments.payment_method  is 'วิธีจ่ายของใบนี้ (หักบัญชีอัตโนมัติ / โอน / เช็ค / เงินสด …)';

-- ตัวเลือกเดียวกันทั้ง 2 ที่ (ป้ายไทยของกลางที่ options.labels)
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, 'payment_method', 'payment_method', v.lbl, 'select', 'text', v.gk,
       true, false, true, false, true, true, true, 1, v.ord,
       jsonb_build_object(
         'options', jsonb_build_array('auto_debit','transfer','counter','cheque','cash','other'),
         'labels', jsonb_build_object(
           'auto_debit','หักบัญชีอัตโนมัติ',
           'transfer','โอนเงิน',
           'counter','จ่ายที่เคาน์เตอร์ธนาคาร',
           'cheque','เช็ค',
           'cash','เงินสด',
           'other','อื่น ๆ')),
       '{}'::jsonb, v.help
from public.erp_modules m
join (values
  ('loan-contracts', 'วิธีจ่าย', 'money', 145, 'วิธีจ่ายประจำตามข้อตกลงกับธนาคาร — ใช้เป็นค่าตั้งต้นตอนบันทึกการจ่ายแต่ละครั้ง'),
  ('loan-payments',  'วิธีจ่าย', 'core',   57, 'ครั้งนี้จ่ายด้วยวิธีไหน')
) as v(mod_key, lbl, gk, ord, help) on v.mod_key = m.module_key
where not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'payment_method');

-- ============================================================
-- บันทึกการจ่าย — รับวิธีจ่ายเพิ่ม (ไม่ส่ง = ใช้ของสัญญา)
-- ============================================================
drop function if exists public.loan_payment_record(uuid, date, numeric, text, text, numeric, numeric, numeric, numeric, text, text, jsonb);

create or replace function public.loan_payment_record(
  p_contract_id uuid, p_payment_date date, p_amount numeric,
  p_paid_from text default '', p_reference text default '',
  p_principal numeric default 0, p_interest numeric default 0,
  p_penalty numeric default 0, p_fee numeric default 0,
  p_receipt_no text default '', p_receipt_image text default '',
  p_lines jsonb default '[]'::jsonb,
  p_payment_method text default ''
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid; r jsonb; i int := 0;
  v_pri numeric(18,2); v_int numeric(18,2); v_pen numeric(18,2); v_fee numeric(18,2); v_oth numeric(18,2) := 0;
  v_split numeric(18,2); v_amt numeric(18,2); v_bucket text; v_method text;
begin
  if p_contract_id is null then raise exception 'กรุณาเลือกสัญญา'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'ยอดจ่ายต้องมากกว่า 0'; end if;

  -- ไม่ระบุวิธีจ่าย → ใช้วิธีจ่ายประจำของสัญญา
  v_method := nullif(coalesce(p_payment_method,''), '');
  if v_method is null then
    select nullif(payment_method,'') into v_method from public.loan_contracts where id = p_contract_id;
  end if;

  v_pri := greatest(coalesce(p_principal,0),0);
  v_int := greatest(coalesce(p_interest,0),0);
  v_pen := greatest(coalesce(p_penalty,0),0);
  v_fee := greatest(coalesce(p_fee,0),0);

  for r in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_amt := greatest(coalesce((r->>'amount')::numeric, 0), 0);
    if v_amt <= 0 then continue; end if;
    v_bucket := coalesce(nullif(r->>'bucket',''), 'fee');
    if v_bucket not in ('principal','interest','penalty','fee','other') then v_bucket := 'fee'; end if;
    if    v_bucket = 'principal' then v_pri := v_pri + v_amt;
    elsif v_bucket = 'interest'  then v_int := v_int + v_amt;
    elsif v_bucket = 'penalty'   then v_pen := v_pen + v_amt;
    elsif v_bucket = 'fee'       then v_fee := v_fee + v_amt;
    else                              v_oth := v_oth + v_amt;
    end if;
  end loop;

  v_split := v_pri + v_int + v_pen + v_fee + v_oth;
  if v_split > 0 and abs(v_split - p_amount) > 0.01 then
    raise exception 'ยอดที่แยก (%) ไม่เท่ากับยอดจ่ายรวม (%)', v_split, p_amount;
  end if;

  insert into public.loan_payments(
    loan_contract_id, payment_date, total_paid, paid_from, reference_no, status,
    principal_amount, interest_amount, penalty_amount, fee_amount, other_amount,
    receipt_no, receipt_image_key, payment_method)
  values (p_contract_id, coalesce(p_payment_date, current_date), p_amount,
          coalesce(p_paid_from,''), coalesce(p_reference,''), 'verified',
          v_pri, v_int, v_pen, v_fee, v_oth,
          coalesce(p_receipt_no,''), coalesce(p_receipt_image,''), coalesce(v_method,''))
  returning id into v_id;

  for r in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_amt := greatest(coalesce((r->>'amount')::numeric, 0), 0);
    if v_amt <= 0 then continue; end if;
    i := i + 1;
    v_bucket := coalesce(nullif(r->>'bucket',''), 'fee');
    if v_bucket not in ('principal','interest','penalty','fee','other') then v_bucket := 'fee'; end if;
    insert into public.loan_payment_lines(payment_id, charge_type_id, label, bucket, amount, sort_order)
    values (v_id, nullif(r->>'charge_type_id','')::uuid, coalesce(nullif(r->>'label',''), 'รายการอื่น'), v_bucket, v_amt, i);
  end loop;

  return v_id;
end $$;
