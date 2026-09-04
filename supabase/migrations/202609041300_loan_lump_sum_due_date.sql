-- "วันกำหนดชำระทั้งหมด" — เงินกู้ก้อนเดียวคืนทีเดียว (เช่น กู้ระยะสั้นจากบุคคล) ไม่ต้องสร้างตารางผ่อนเอง
-- ใส่วันในช่องนี้ → ระบบสร้างตารางผ่อน "งวดเดียว" ให้ (source = 'lump_sum') → โผล่บนกระดานเงินสด/งวดถัดไป
--   • เงินต้น = เงินต้นตามสัญญา · ดอกเบี้ย = เงินต้น × อัตราต่อปี × วัน(เริ่ม→ครบกำหนด)/365 (ถ้ามีวันเริ่ม+อัตรา)
--   • แก้วัน/ยอด/อัตรา → งวดเดียวนั้นปรับตาม · ถ้าสัญญามีตารางผ่อนจริงอยู่แล้ว (source อื่น) ระบบไม่ยุ่ง
--   • ล้างวัน → ปิดตารางงวดเดียว (superseded)
alter table public.loan_contracts add column if not exists lump_sum_due_date date;
comment on column public.loan_contracts.lump_sum_due_date is 'วันกำหนดชำระทั้งหมด (กู้ก้อนเดียวคืนทีเดียว) — ระบบสร้างตารางผ่อนงวดเดียวให้อัตโนมัติ';

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text, placeholder)
select m.id, 'lump_sum_due_date', 'lump_sum_due_date', 'วันกำหนดชำระทั้งหมด', 'date', 'date', 'period',
       true, false, true, false, true, true, true, 1, 158, '{}'::jsonb, '{}'::jsonb,
       'สำหรับกู้ก้อนเดียวคืนทีเดียว — ใส่วันแล้วระบบสร้างงวดเดียวให้เอง (ขึ้นบนกระดานเงินสด) · ถ้าผ่อนเป็นงวด ปล่อยว่างแล้วใช้ตารางผ่อนแทน', null
from public.erp_modules m
where m.module_key = 'loan-contracts'
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'lump_sum_due_date');

create or replace function public.loan_contract_lump_sum_sync(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_c public.loan_contracts%rowtype;
  v_ver uuid; v_src text; v_no int; v_amt numeric(18,2); v_int numeric(18,2); v_days int;
begin
  select * into v_c from public.loan_contracts where id = p_id;
  if not found then return; end if;

  select id, source into v_ver, v_src from public.loan_schedule_versions
   where loan_contract_id = p_id and status = 'active' order by version_no desc limit 1;

  -- ล้างวัน → ปิดตารางงวดเดียวที่ระบบสร้างไว้
  if v_c.lump_sum_due_date is null then
    if v_ver is not null and v_src = 'lump_sum' then
      update public.loan_schedule_versions set status = 'superseded' where id = v_ver;
      perform public.loan_contract_reallocate(p_id);
    end if;
    return;
  end if;

  -- มีตารางผ่อนจริงอยู่แล้ว (คนสร้าง/ปรับโครงสร้าง) → ไม่ยุ่ง
  if v_ver is not null and v_src <> 'lump_sum' then return; end if;

  v_amt := case when coalesce(v_c.contracted_principal,0) > 0 then v_c.contracted_principal else coalesce(v_c.approved_limit,0) end;
  if v_amt <= 0 then return; end if;
  v_days := case when v_c.start_date is not null and v_c.lump_sum_due_date > v_c.start_date
                 then (v_c.lump_sum_due_date - v_c.start_date) else 0 end;
  v_int := round(v_amt * coalesce(v_c.interest_rate,0) / 100.0 * v_days / 365.0, 2);

  if v_ver is null then
    select coalesce(max(version_no),0) + 1 into v_no from public.loan_schedule_versions where loan_contract_id = p_id;
    insert into public.loan_schedule_versions
      (loan_contract_id, version_no, effective_date, calculation_method, source, reason, status)
    values (p_id, v_no, coalesce(v_c.start_date, current_date), 'custom', 'lump_sum',
            'ชำระทั้งหมดครั้งเดียว (ระบบสร้างจากช่อง "วันกำหนดชำระทั้งหมด")', 'active')
    returning id into v_ver;
    insert into public.loan_installments
      (schedule_version_id, loan_contract_id, installment_no, due_date, opening_principal,
       principal_due, interest_due, total_due, closing_principal, payment_status)
    values (v_ver, p_id, 1, v_c.lump_sum_due_date, v_amt, v_amt, v_int, v_amt + v_int, 0, 'unpaid');
  else
    update public.loan_installments
       set due_date = v_c.lump_sum_due_date, principal_due = v_amt, interest_due = v_int
     where schedule_version_id = v_ver and installment_no = 1;
  end if;

  perform public.loan_schedule_chain_recompute(v_ver);
  perform public.loan_schedule_version_recompute(v_ver);

  -- วันสิ้นสุดสัญญา = วันกำหนดชำระ (ถ้ายังว่าง)
  update public.loan_contracts set end_date = lump_sum_due_date where id = p_id and end_date is null;

  perform public.loan_contract_reallocate(p_id);
end $$;

create or replace function public.loan_contracts_lump_sum_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'UPDATE' and new.lump_sum_due_date is null and old.lump_sum_due_date is null then return null; end if;
  perform public.loan_contract_lump_sum_sync(new.id);
  return null;
end $$;

drop trigger if exists trg_loan_contracts_lump_sum on public.loan_contracts;
create trigger trg_loan_contracts_lump_sum
after insert or update of lump_sum_due_date, contracted_principal, approved_limit, interest_rate, start_date
on public.loan_contracts
for each row execute function public.loan_contracts_lump_sum_trg();
