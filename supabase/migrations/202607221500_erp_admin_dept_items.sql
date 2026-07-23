-- ของกลาง: "รายการที่ต้องจัดการ" ต่อแผนก (สำหรับ Popup กดจากการ์ดผู้บริหาร)
-- คืน [{ key, label, link, items: [{ title, subtitle, link }] }] · จำกัด 50 ต่อกลุ่ม
-- เฉพาะ service_role (API gate admin ก่อนเรียก) — ตามนโยบายเฟส 7
CREATE OR REPLACE FUNCTION public.erp_admin_dept_items(p_dept text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select case p_dept

    when 'production' then jsonb_build_array(
      jsonb_build_object('key','unassigned','label','ยังไม่แจกงาน','link','/master/production-dashboard','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', mo_no,
            'subtitle', left(coalesce(product_name,product_sku,''),40)||' · '||to_char(coalesce(qty,0),'FM999G999G990')||' ชิ้น',
            'link','/master/production-dashboard'))
        from (select mo_no,product_name,product_sku,qty from manufacturing_orders m
              where coalesce(is_active,true) and status not in ('done','cancelled')
                and not exists(select 1 from mo_work_orders w where w.mo_no=m.mo_no and coalesce(w.is_active,true))
              order by created_at desc limit 50) x),'[]'::jsonb)),
      jsonb_build_object('key','overdue','label','เลยกำหนด','link','/master/production-dashboard','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', mo_no,
            'subtitle', left(coalesce(product_name,product_sku,''),40)||' · ครบ '||to_char(due_date,'DD/MM'),
            'link','/master/production-dashboard'))
        from (select mo_no,product_name,product_sku,due_date from manufacturing_orders
              where coalesce(is_active,true) and status not in ('done','cancelled') and due_date < current_date
              order by due_date asc limit 50) x),'[]'::jsonb))
    )

    when 'purchasing' then jsonb_build_array(
      jsonb_build_object('key','pr_waiting','label','ขอซื้อรออนุมัติ','link','/purchasing/orders','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', coalesce(pr_no,'—')||' · '||left(coalesce(item_name,''),30),
            'subtitle', 'โดย '||coalesce(requester,'-')||' · '||to_char(coalesce(qty,0),'FM999G999G990')||' '||coalesce(uom,''),
            'link','/purchasing/orders'))
        from (select pr_no,item_name,requester,qty,uom from purchase_requests_v2
              where coalesce(is_active,true) and status='waiting' order by created_at desc limit 50) x),'[]'::jsonb)),
      jsonb_build_object('key','awaiting','label','รอของเข้า','link','/purchasing/receive','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', po_no||' · '||coalesce(seller_name,''),
            'subtitle', case when expected_date is not null then 'คาดเข้า '||to_char(expected_date,'DD/MM') else 'ยังไม่ระบุวันเข้า' end,
            'link','/purchasing/receive'))
        from (select po_no,seller_name,expected_date,order_date from purchase_orders_v2
              where coalesce(is_active,true) and status in ('purchase','partial') order by coalesce(expected_date,order_date) asc limit 50) x),'[]'::jsonb))
    )

    when 'sales' then jsonb_build_array(
      jsonb_build_object('key','billing_unpaid','label','ใบวางบิลค้างเก็บ','link','/billing-notes','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', coalesce(bill_number,'—')||' · '||coalesce(customer_name,''),
            'subtitle', 'ค้าง ฿'||to_char(round(coalesce(amount_due,0)),'FM999G999G990')||case when due_date is not null then ' · ครบ '||to_char(due_date,'DD/MM') else '' end,
            'link','/billing-notes'))
        from (select bill_number,customer_name,amount_due,due_date from erp_playground_billing_notes
              where status not in ('cancelled','paid') order by due_date asc nulls last limit 50) x),'[]'::jsonb))
    )

    when 'qc' then jsonb_build_array(
      jsonb_build_object('key','defect','label','ของเสียค้าง','link','/master/qc-warehouse','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', coalesce(nullif(sku,''),'—')||' · '||coalesce(defect_type,''),
            'subtitle', to_char(coalesce(qty,0),'FM999G999G990')||' ชิ้น'||case when worker is not null then ' · '||worker else '' end,
            'link','/master/qc-warehouse'))
        from (select sku,defect_type,qty,worker from defect_logs where coalesce(is_active,true) order by created_at desc limit 50) x),'[]'::jsonb)),
      jsonb_build_object('key','pending','label','งานรอตรวจ','link','/master/qc-warehouse','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', wo_no||coalesce(' · '||product_name,''),
            'subtitle', 'รอตรวจ '||to_char(coalesce(received_qty,0)-coalesce(qc_pulled_qty,0),'FM999G999G990')||' ชิ้น',
            'link','/master/qc-warehouse'))
        from (select wo_no,product_name,received_qty,qc_pulled_qty,updated_at from mo_work_orders
              where coalesce(is_active,true) and coalesce(received_qty,0)>coalesce(qc_pulled_qty,0) order by updated_at desc limit 50) x),'[]'::jsonb))
    )

    when 'design' then jsonb_build_array(
      jsonb_build_object('key','due_soon','label','ใกล้ครบกำหนด (7 วัน)','link','/master/design-dashboard','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', code||' · '||left(coalesce(name,''),30),
            'subtitle', 'ครบ '||to_char(deadline,'DD/MM'), 'link','/master/design-dashboard'))
        from (select code,name,deadline from design_sheets
              where coalesce(is_active,true) and status not in ('sku_created','cancelled')
                and deadline is not null and deadline>=current_date and deadline<current_date+8
              order by deadline asc limit 50) x),'[]'::jsonb)),
      jsonb_build_object('key','quoted','label','รอส่งลูกค้า','link','/master/design-dashboard','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', code||' · '||left(coalesce(name,''),30),
            'subtitle', 'รอส่งลูกค้า', 'link','/master/design-dashboard'))
        from (select code,name,updated_at from design_sheets
              where coalesce(is_active,true) and status='quoted' order by updated_at desc limit 50) x),'[]'::jsonb))
    )

    when 'tasks' then jsonb_build_array(
      jsonb_build_object('key','review','label','รอตรวจ/อนุมัติ','link','/tasks','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', left(coalesce(st.title,'งานย่อย'),40),
            'subtitle', coalesce(t.task_no,''), 'link','/tasks'))
        from (select id,title,task_id from erp_creative_subtasks where status='submitted' order by id desc limit 50) st
        left join erp_creative_tasks t on t.id=st.task_id),'[]'::jsonb)),
      jsonb_build_object('key','overdue','label','เกินกำหนด','link','/tasks','items', coalesce((
        select jsonb_agg(jsonb_build_object('title', task_no||' · '||left(coalesce(title,''),30),
            'subtitle', 'ครบ '||to_char(due_date,'DD/MM'), 'link','/tasks'))
        from (select task_no,title,due_date from erp_creative_tasks
              where coalesce(is_active,true) and status not in ('done','cancelled') and due_date is not null and due_date<current_date
              order by due_date asc limit 50) x),'[]'::jsonb))
    )

    else '[]'::jsonb
  end;
$function$;

grant execute on function public.erp_admin_dept_items(text) to service_role;
