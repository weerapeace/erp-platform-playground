-- ปฏิทินรวม (โหมดปฏิทิน): รวมเดดไลน์จริงจากทุกแผนกในช่วงวันที่ ครั้งเดียว
-- module: production/purchasing/design/billing/tasks/sales — คืน [{id,module,date,title,link}]
CREATE OR REPLACE FUNCTION public.erp_calendar_events(p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(e order by (e->>'date')), '[]'::jsonb)
  from (
    -- ผลิต: ใบสั่งผลิตครบกำหนดส่ง
    select jsonb_build_object('id','mo:'||id, 'module','production', 'date',due_date,
        'title', mo_no || ' · ' || left(coalesce(product_name, product_sku, ''), 40),
        'link', '/master/production-dashboard') e
    from manufacturing_orders
    where coalesce(is_active,true) and status not in ('done','cancelled') and due_date between p_from and p_to
    union all
    -- ซื้อ: ของเข้า (วันคาดว่าจะได้รับ)
    select jsonb_build_object('id','po:'||id, 'module','purchasing', 'date',expected_date,
        'title', 'ของเข้า ' || po_no || ' · ' || coalesce(seller_name,''),
        'link', '/purchasing/receive')
    from purchase_orders_v2
    where coalesce(is_active,true) and status in ('purchase','partial') and expected_date between p_from and p_to
    union all
    -- Design: ตัวอย่างครบกำหนด
    select jsonb_build_object('id','ds:'||id, 'module','design', 'date',deadline,
        'title', code || ' · ' || left(coalesce(name,''), 40),
        'link', '/master/design-dashboard')
    from design_sheets
    where coalesce(is_active,true) and status not in ('sku_created','cancelled') and deadline between p_from and p_to
    union all
    -- ใบวางบิล: ครบกำหนดชำระ
    select jsonb_build_object('id','bn:'||id, 'module','billing', 'date',due_date,
        'title', 'วางบิล ' || bill_number || ' · ' || coalesce(customer_name,''),
        'link', '/billing-notes')
    from erp_playground_billing_notes
    where status not in ('cancelled','paid') and due_date between p_from and p_to
    union all
    -- งาน: เดดไลน์งาน
    select jsonb_build_object('id','ct:'||id, 'module','tasks', 'date',due_date,
        'title', task_no || ' · ' || left(coalesce(title,''), 40),
        'link', '/tasks')
    from erp_creative_tasks
    where coalesce(is_active,true) and status not in ('done','cancelled') and due_date between p_from and p_to
    union all
    -- ขาย: นัดส่งของ
    select jsonb_build_object('id','so:'||id, 'module','sales', 'date',expected_ship_date,
        'title', 'ส่งของ ' || so_number || ' · ' || coalesce(customer_name,''),
        'link', '/sales-orders')
    from erp_playground_sales_orders
    where status='confirmed' and expected_ship_date between p_from and p_to
  ) t;
$function$;

grant execute on function public.erp_calendar_events(date, date) to authenticated;

-- เมนู "ปฏิทินรวม" ในหมวดหน้าหลัก (idempotent)
insert into erp_menu_items (section, section_order, sort_order, icon, label, href, show_in_sidebar, show_in_launcher, permission_key, app_keys, is_active)
select 'หน้าหลัก',
       (select section_order from erp_menu_items where section='หน้าหลัก' order by section_order limit 1),
       22, '📅', 'ปฏิทินรวม', '/calendar', true, true, null, array['home'], true
where not exists (select 1 from erp_menu_items where href='/calendar');
