-- รายงานสรุปรายเดือน (ของกลาง): ผลิตต่อโต๊ะ / ขาย / ใบวางบิล / QC — ครั้งเดียวจบ
-- p_month = วันที่ใดก็ได้ในเดือนที่ต้องการ (ใช้ date_trunc('month') เป็นช่วง)
CREATE OR REPLACE FUNCTION public.erp_monthly_report(p_month date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with b as (
    select date_trunc('month', p_month) as s, date_trunc('month', p_month) + interval '1 month' as e
  ),
  prod_src as (
    select coalesce(nullif(trim(department_name),''), nullif(trim(craftsman_name),''), 'ไม่ระบุ') as worker,
           1 as jobs, coalesce(qty,0) as qty, coalesce(wage,0) as wage
    from wo_submissions, b
    where submitted_at >= b.s::date and submitted_at < b.e::date
    union all
    select coalesce(nullif(trim(assignee_name),''), 'งานเหมา (ไม่ระบุ)') as worker,
           1, coalesce(total_qty,0), coalesce(rate,0)*coalesce(total_qty,0)
    from mo_piecework, b
    where coalesce(is_active,true) and status='done' and done_at >= b.s and done_at < b.e
  ),
  prod as (
    select worker, sum(jobs)::int jobs, sum(qty) qty, sum(wage) wage
    from prod_src group by worker order by sum(wage) desc
  ),
  sales_cust as (
    select coalesce(nullif(trim(customer_name),''),'ไม่ระบุ') customer, count(*)::int orders, coalesce(sum(grand_total),0) total
    from erp_playground_sales_orders, b
    where status='confirmed' and order_date >= b.s::date and order_date < b.e::date
    group by 1 order by 3 desc limit 15
  ),
  bill as (
    select count(*)::int notes,
           coalesce(sum(grand_total),0) total,
           coalesce(sum(grand_total) filter (where status='paid' or paid_at is not null),0) paid,
           coalesce(sum(amount_due) filter (where status not in ('cancelled','paid')),0) unpaid
    from erp_playground_billing_notes, b
    where bill_date >= b.s::date and bill_date < b.e::date
  ),
  qc_type as (
    select coalesce(nullif(trim(defect_type),''),'ไม่ระบุ') dtype, count(*)::int cnt, coalesce(sum(qty),0) qty
    from defect_logs, b
    where coalesce(is_active,true) and created_at >= b.s and created_at < b.e
    group by 1 order by 2 desc limit 15
  )
  select jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'production', jsonb_build_object(
      'workers', coalesce((select jsonb_agg(jsonb_build_object('worker',worker,'jobs',jobs,'qty',qty,'wage',round(wage))) from prod), '[]'::jsonb),
      'total_wage', coalesce((select round(sum(wage)) from prod), 0),
      'total_qty',  coalesce((select sum(qty) from prod), 0),
      'total_jobs', coalesce((select sum(jobs) from prod), 0)
    ),
    'sales', jsonb_build_object(
      'orders', coalesce((select sum(orders) from sales_cust), 0),
      'total',  coalesce((select round(sum(total)) from sales_cust), 0),
      'by_customer', coalesce((select jsonb_agg(jsonb_build_object('customer',customer,'orders',orders,'total',round(total))) from sales_cust), '[]'::jsonb)
    ),
    'billing', (select jsonb_build_object('notes',notes,'total',round(total),'paid',round(paid),'unpaid',round(unpaid)) from bill),
    'qc', jsonb_build_object(
      'defects', coalesce((select sum(cnt) from qc_type), 0),
      'defect_qty', coalesce((select sum(qty) from qc_type), 0),
      'by_type', coalesce((select jsonb_agg(jsonb_build_object('type',dtype,'count',cnt,'qty',qty)) from qc_type), '[]'::jsonb)
    )
  );
$function$;

grant execute on function public.erp_monthly_report(date) to authenticated;

-- เมนู "รายงานสรุปเดือน" (เฉพาะแอดมิน) ในหมวดหน้าหลัก (idempotent)
insert into erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, app_keys, is_active)
select 'หน้าหลัก',
       (select section_order from erp_menu_items where section='หน้าหลัก' order by section_order limit 1),
       24, '📄', 'รายงานสรุปเดือน', '/reports/monthly', true, true, 'admin.users', array['home'], true
where not exists (select 1 from erp_menu_items where href='/reports/monthly');
