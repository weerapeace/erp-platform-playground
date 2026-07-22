-- เฟส 6: Design "วันนัด/วันได้ตัวอย่าง" + อัปเกรดปฏิทินรวม (เพิ่มชั้น QC ส่งงาน + Design วันนัด)

-- 1) ช่องใหม่: วันนัด/วันได้ตัวอย่าง ใน Design (แยกจาก deadline)
ALTER TABLE public.design_sheets ADD COLUMN IF NOT EXISTS appointment_date date;
COMMENT ON COLUMN public.design_sheets.appointment_date IS 'วันนัด/วันได้ตัวอย่าง (แยกจาก deadline ที่เป็นวันครบกำหนด)';

-- 2) อัปเกรด erp_calendar_events: เพิ่มชั้น qc (งานรอตรวจ ใช้กำหนดส่งใบสั่งงาน) + design วันนัด
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
    -- QC: งานที่รอตรวจ (ใช้กำหนดส่งของใบสั่งงาน)
    select jsonb_build_object('id','wo:'||id, 'module','qc', 'date',due_date,
        'title', 'ส่ง QC · ' || wo_no || coalesce(' · ' || product_name, ''),
        'link', '/master/qc-warehouse')
    from mo_work_orders
    where coalesce(is_active,true) and coalesce(received_qty,0) > coalesce(qc_pulled_qty,0) and due_date between p_from and p_to
    union all
    -- Design: ตัวอย่างครบกำหนด
    select jsonb_build_object('id','ds:'||id, 'module','design', 'date',deadline,
        'title', code || ' · ' || left(coalesce(name,''), 40),
        'link', '/master/design-dashboard')
    from design_sheets
    where coalesce(is_active,true) and status not in ('sku_created','cancelled') and deadline between p_from and p_to
    union all
    -- Design: วันนัด/วันได้ตัวอย่าง
    select jsonb_build_object('id','dsa:'||id, 'module','design', 'date',appointment_date,
        'title', '📌 นัด ' || code || ' · ' || left(coalesce(name,''), 30),
        'link', '/master/design-dashboard')
    from design_sheets
    where coalesce(is_active,true) and status not in ('sku_created','cancelled') and appointment_date between p_from and p_to
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
