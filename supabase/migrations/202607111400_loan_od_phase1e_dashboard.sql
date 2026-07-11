-- Phase 1e: Loan Dashboard RPC + menu — additive only
-- สรุปภาพรวมเงินกู้จากรายการต้นทาง (เงินต้นคงเหลือ/เบิก/จ่าย + ใกล้ครบ/เกินกำหนด)

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
        'total_paid', coalesce(sum(principal_paid_amount), 0)
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

insert into public.erp_menu_items
  (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, app_keys, module_key, is_active)
select 'ภาพรวม', 150, 5, '📊', 'Dashboard เงินกู้', '/loan-dashboard', true, true, array['loan-od'], null, true
where not exists (select 1 from public.erp_menu_items where href = '/loan-dashboard');
