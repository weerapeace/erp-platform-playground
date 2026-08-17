-- ============================================================
-- Loan & OD — เจ้าของหนี้เป็น "บริษัท" หรือ "บุคคล" ก็ได้
-- ------------------------------------------------------------
-- เจ้าของขอ: "เพิ่มเป็นแบบ บริษัท หรือ บุคคลได้ด้วย"
--   (หนี้บางก้อนกู้ในนามบุคคล เช่น กรรมการ ไม่ได้อยู่ในนามนิติบุคคล)
--
-- ทำไมไม่เอาบุคคลไปใส่ในทะเบียนบริษัท:
--   ตาราง companies ถูกใช้ทำ "หัวบิล/ใบกำกับภาษี" ด้วย — ถ้าเอาชื่อคนไปปน
--   ชื่อคนจะไปโผล่ในช่องเลือกบริษัทตอนออกเอกสารขาย ซึ่งไม่ถูกต้อง
--   → แยกเป็น "ประเภทเจ้าของหนี้" + ช่องชื่อบุคคล แทน (คุมเฉพาะโมดูลเงินกู้)
--
-- ใช้ของกลาง condition_rules: เลือก "บริษัท" → โชว์ช่องบริษัท · เลือก "บุคคล" → โชว์ช่องชื่อ
-- ============================================================

alter table public.loan_contracts
  add column if not exists owner_type   text not null default 'company',
  add column if not exists owner_person text not null default '';
alter table public.od_facilities
  add column if not exists owner_type   text not null default 'company',
  add column if not exists owner_person text not null default '';

alter table public.loan_contracts drop constraint if exists loan_contracts_owner_type_chk;
alter table public.loan_contracts add constraint loan_contracts_owner_type_chk
  check (owner_type in ('company', 'person'));
alter table public.od_facilities drop constraint if exists od_facilities_owner_type_chk;
alter table public.od_facilities add constraint od_facilities_owner_type_chk
  check (owner_type in ('company', 'person'));

comment on column public.loan_contracts.owner_type is 'เจ้าของหนี้เป็นนิติบุคคลหรือบุคคลธรรมดา: company | person';
comment on column public.loan_contracts.owner_person is 'ชื่อบุคคลที่เป็นเจ้าของหนี้ (ใช้เมื่อ owner_type = person)';

-- ============================================================
-- ทะเบียนฟิลด์ — ประเภทเจ้าของหนี้ + ชื่อบุคคล
-- ============================================================
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, condition_rules, help_text)
select m.id, 'owner_type', 'owner_type', 'เจ้าของหนี้เป็น', 'select', 'text', 'core',
       false, false, true, false, true, true, true, 1, 33,
       jsonb_build_object('options', jsonb_build_array('company','person'),
                          'labels', jsonb_build_object('company','บริษัท (นิติบุคคล)','person','บุคคลธรรมดา')),
       '{}'::jsonb, '{}'::jsonb,
       'กู้ในนามบริษัทในกลุ่ม หรือในนามบุคคล — เลือกแล้วช่องข้างล่างจะเปลี่ยนตาม'
from public.erp_modules m
where m.module_key in ('loan-contracts','od-facilities')
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'owner_type');

insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, condition_rules, help_text)
select m.id, 'owner_person', 'owner_person', 'ชื่อบุคคล (เจ้าของหนี้)', 'text', 'text', 'core',
       true, false, true, true, true, true, true, 1, 36,
       '{}'::jsonb, '{}'::jsonb,
       jsonb_build_object('show_if', jsonb_build_object('field','owner_type','operator','=','value','person')),
       'ชื่อ-นามสกุลของผู้กู้ กรณีกู้ในนามบุคคล'
from public.erp_modules m
where m.module_key in ('loan-contracts','od-facilities')
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'owner_person');

-- ช่องบริษัทเดิม → โชว์เฉพาะตอนเลือก "บริษัท"
update public.erp_module_fields f
set condition_rules = jsonb_build_object('show_if', jsonb_build_object('field','owner_type','operator','=','value','company'))
from public.erp_modules m
where m.id = f.module_id
  and m.module_key in ('loan-contracts','od-facilities')
  and f.column_name = 'company_id';

-- ============================================================
-- Dashboard — จัดกลุ่มตาม "เจ้าของหนี้" (บริษัท หรือ ชื่อบุคคล)
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
    'by_company', (
      select coalesce(jsonb_agg(x.j order by x.outstanding desc), '[]'::jsonb) from (
        select coalesce(sum(c.outstanding_principal), 0) as outstanding,
               jsonb_build_object(
                 'company', case
                    when c.owner_type = 'person' then coalesce(nullif(c.owner_person,''), 'บุคคล (ยังไม่ระบุชื่อ)')
                    else coalesce(nullif(co.name, ''), 'ยังไม่ระบุบริษัท') end,
                 'company_code', case when c.owner_type = 'person' then 'บุคคล' else coalesce(co.company_code, '') end,
                 'contract_count', count(*),
                 'outstanding', coalesce(sum(c.outstanding_principal), 0),
                 'monthly_estimate', coalesce(sum(c.estimated_monthly_payment), 0)) j
        from public.loan_contracts c
        left join public.companies co on co.id = c.company_id
        where c.is_active and c.lifecycle_status = 'active'
        group by c.owner_type,
                 case when c.owner_type = 'person' then coalesce(nullif(c.owner_person,''), 'บุคคล (ยังไม่ระบุชื่อ)')
                      else coalesce(nullif(co.name, ''), 'ยังไม่ระบุบริษัท') end,
                 case when c.owner_type = 'person' then 'บุคคล' else coalesce(co.company_code, '') end
      ) x
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
