-- ============================================================
-- Loan & OD — ระบุ "บริษัท" เจ้าของหนี้ (กลุ่มมีหลายบริษัท)
-- ------------------------------------------------------------
-- เจ้าของขอ: "อยากเพิ่มบริษัทด้วย บางทีหลายบริษัท"
--
-- ใช้ทะเบียนบริษัทกลางที่มีอยู่แล้ว (ตาราง companies · ตั้งค่าที่ /admin/companies)
-- ใส่ให้ทั้งสัญญาเงินกู้และวงเงิน OD — หนี้ทุกก้อนจะได้รู้ว่าเป็นของบริษัทไหน
-- + Dashboard แยกยอดรายบริษัทให้ด้วย
-- ============================================================

alter table public.loan_contracts add column if not exists company_id uuid references public.companies(id);
alter table public.od_facilities  add column if not exists company_id uuid references public.companies(id);

create index if not exists idx_loan_contracts_company on public.loan_contracts(company_id);
create index if not exists idx_od_facilities_company  on public.od_facilities(company_id);

comment on column public.loan_contracts.company_id is 'บริษัทในกลุ่มที่เป็นเจ้าของหนี้ก้อนนี้ (ตาราง companies)';

-- ============================================================
-- ทะเบียนฟิลด์ — ช่องเลือกบริษัท (ตัวเลือกค้นหาได้ของกลาง)
-- ============================================================
insert into public.erp_module_fields
  (module_id, field_key, column_name, field_label, ui_field_type, data_type, group_key,
   is_visible, is_required, is_editable, is_searchable, is_filterable, is_sortable,
   show_in_form, form_column_span, display_order, options, relation_config, help_text)
select m.id, 'company_id', 'company_id', 'บริษัท', 'relation', 'uuid', 'core',
       true, false, true, false, true, true, true, 1, v.ord, '{}'::jsonb,
       jsonb_build_object(
         'allow_create', false,
         'target_table', 'companies',
         'target_module_key', 'payroll-companies',
         'target_label_field', 'name',
         'target_search_fields', jsonb_build_array('name', 'company_code', 'name_th'),
         'secondary_label_field', 'company_code'),
       'บริษัทในกลุ่มที่เป็นเจ้าของหนี้ก้อนนี้ — เพิ่ม/แก้รายชื่อบริษัทได้ที่ ตั้งค่า → บริษัท'
from public.erp_modules m
cross join (values ('loan-contracts', 35), ('od-facilities', 35)) as v(mod_key, ord)
where m.module_key = v.mod_key
  and not exists (select 1 from public.erp_module_fields f where f.module_id = m.id and f.column_name = 'company_id');

-- ============================================================
-- Dashboard — แยกยอดรายบริษัท (เพิ่มจากของเดิม ไม่ตัดอะไรออก)
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
                 'company', coalesce(nullif(co.name, ''), 'ยังไม่ระบุบริษัท'),
                 'company_code', coalesce(co.company_code, ''),
                 'contract_count', count(*),
                 'outstanding', coalesce(sum(c.outstanding_principal), 0),
                 'monthly_estimate', coalesce(sum(c.estimated_monthly_payment), 0)) j
        from public.loan_contracts c
        left join public.companies co on co.id = c.company_id
        where c.is_active and c.lifecycle_status = 'active'
        group by co.id, co.name, co.company_code
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
