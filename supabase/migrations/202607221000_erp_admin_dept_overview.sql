-- ของกลางสำหรับ Dashboard ผู้บริหาร: รวมตัวเลข "งานค้าง/สรุป" ต่อแผนกในครั้งเดียว
-- เติมส่วนที่ erp_executive_summary ยังไม่มี (แผนก ผลิต/ซื้อ/ขาย/QC/Design/งาน)
-- STABLE + SECURITY DEFINER: อ่านข้ามตารางได้ในคิวรี่เดียว, gate สิทธิ์ทำที่ API (admin)
CREATE OR REPLACE FUNCTION public.erp_admin_dept_overview()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with rate as (
    select coalesce((select rate from daily_rates where coalesce(is_active,true) and rate>0 order by rate_date desc limit 1),5.0) as r
  )
  select jsonb_build_object(
    'production', jsonb_build_object(
      -- ยังไม่แจกงาน = MO ที่ยังไม่มีใบสั่งงาน (โต๊ะ) เลย
      'unassigned', (select count(*)::int from manufacturing_orders m
        where coalesce(m.is_active,true) and m.status not in ('done','cancelled')
          and not exists (select 1 from mo_work_orders w where w.mo_no=m.mo_no and coalesce(w.is_active,true))),
      -- กำลังผลิต = MO ที่มีใบสั่งงานแจกออกไปแล้ว (dispatched)
      'in_production', (select count(*)::int from manufacturing_orders m
        where coalesce(m.is_active,true) and m.status not in ('done','cancelled')
          and exists (select 1 from mo_work_orders w where w.mo_no=m.mo_no and coalesce(w.is_active,true) and w.status='dispatched')),
      -- ค่าแรงเดือนนี้ = ค่าจ้างส่งงาน (wo_submissions) + งานเหมาที่เสร็จ (mo_piecework done)
      'labor_month', round(
        (select coalesce(sum(wage),0) from wo_submissions where submitted_at >= date_trunc('month',current_date))
        + (select coalesce(sum(rate*total_qty),0) from mo_piecework
             where coalesce(is_active,true) and status='done' and done_at >= date_trunc('month',current_date))
      )
    ),
    'purchasing', jsonb_build_object(
      -- รอของเข้า = PO ที่สั่งแล้วแต่ยังไม่ครบ (purchase/partial)
      'awaiting_goods', (select count(*)::int from purchase_orders_v2
        where coalesce(is_active,true) and status in ('purchase','partial')),
      -- ยอดซื้อเดือนนี้ = มูลค่า PO ที่สั่งเดือนนี้ (แปลง RMB→บาท)
      'spend_month', round((select coalesce(sum(
          case when upper(currency) in ('RMB','YUAN','CNY') then grand_total*(select r from rate) else grand_total end
        ),0) from purchase_orders_v2
        where coalesce(is_active,true) and status in ('purchase','partial') and order_date >= date_trunc('month',current_date)))
    ),
    'sales', jsonb_build_object(
      -- ออเดอร์ขายเดือนนี้ (ยืนยันแล้ว)
      'orders_month', (select count(*)::int from erp_playground_sales_orders
        where status='confirmed' and order_date >= date_trunc('month',current_date))
    ),
    'qc', jsonb_build_object(
      -- งานรอ QC ตรวจ = ของที่รับเข้าแล้วแต่ยังไม่ดึงเข้า QC
      'pending_check', (select count(*)::int from mo_work_orders
        where coalesce(is_active,true) and coalesce(received_qty,0) > coalesce(qc_pulled_qty,0))
    ),
    'design', jsonb_build_object(
      -- ใกล้ครบกำหนด (ภายใน 7 วัน) ที่ยังไม่ปิดงาน
      'due_soon', (select count(*)::int from design_sheets
        where coalesce(is_active,true) and status not in ('sku_created','cancelled')
          and deadline is not null and deadline >= current_date and deadline < current_date + 8),
      'designing', (select count(*)::int from design_sheets where coalesce(is_active,true) and status='design'),
      'quoted',    (select count(*)::int from design_sheets where coalesce(is_active,true) and status='quoted'),
      'revising',  (select count(*)::int from design_sheets where coalesce(is_active,true) and status='revising')
    ),
    'tasks', jsonb_build_object(
      'total_active',   (select count(*)::int from erp_creative_tasks where coalesce(is_active,true) and status not in ('done','cancelled')),
      -- รอตรวจ/อนุมัติ = subtask ที่ส่งมาให้ตรวจ
      'review_pending', (select count(*)::int from erp_creative_subtasks where status='submitted'),
      'overdue',        (select count(*)::int from erp_creative_tasks
        where coalesce(is_active,true) and status not in ('done','cancelled') and due_date is not null and due_date < current_date),
      'done_month',     (select count(*)::int from erp_creative_tasks where completed_at >= date_trunc('month',current_date))
    )
  );
$function$;

grant execute on function public.erp_admin_dept_overview() to authenticated;
