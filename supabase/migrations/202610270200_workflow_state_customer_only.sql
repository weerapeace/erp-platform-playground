-- สถานะ "ใช้เฉพาะงานลูกค้า" (Workflow กลาง)
-- เจ้าของขอ: แบรนด์ของเราเอง (brands.is_customer_job = false) ไม่มีขั้นส่งลูกค้า
-- → สถานะที่ติ๊ก customer_only จะถูกซ่อนจากบอร์ด/ป๊อปอัป/หน้ามือถือ ของงานแบรนด์เรา
-- ค่าเริ่มต้น false = ทุก entity อื่นไม่เปลี่ยนพฤติกรรม

alter table public.erp_workflow_states
  add column if not exists customer_only boolean not null default false;

-- เพิ่มพารามิเตอร์ p_customer_only (ไม่บังคับ) — ผู้เรียกเดิมที่ไม่ส่งมา = คงค่าเดิมไว้ ไม่รีเซ็ต
drop function if exists public.erp_workflow_state_upsert(uuid, text, text, text, text, boolean, boolean, integer, text);

create or replace function public.erp_workflow_state_upsert(
  p_id uuid, p_entity_type text, p_state_key text, p_label text, p_color text,
  p_is_terminal boolean, p_lock_edit boolean, p_sort_order integer,
  p_actor text default null, p_customer_only boolean default null)
 returns erp_workflow_states
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_row public.erp_workflow_states;
begin
  if not erp_can('admin.workflow') then raise exception 'ไม่มีสิทธิ์ (admin.workflow)'; end if;
  if p_id is null then
    insert into public.erp_workflow_states
      (entity_type, state_key, label, color, is_terminal, lock_edit, sort_order, customer_only)
    values (p_entity_type, p_state_key, p_label, p_color, p_is_terminal, p_lock_edit, p_sort_order, coalesce(p_customer_only, false))
    returning * into v_row;
  else
    update public.erp_workflow_states set
      state_key = p_state_key, label = p_label, color = p_color,
      is_terminal = p_is_terminal, lock_edit = p_lock_edit, sort_order = p_sort_order,
      customer_only = coalesce(p_customer_only, customer_only)
    where id = p_id returning * into v_row;
    if not found then raise exception 'ไม่พบ state %', p_id; end if;
  end if;
  insert into public.audit_logs (action, entity_type, entity_id, metadata)
  values (case when p_id is null then 'create' else 'update' end, 'erp_workflow_state', v_row.id,
    jsonb_build_object('entity_type', p_entity_type, 'state_key', p_state_key, 'actor', p_actor,
      'customer_only', v_row.customer_only));
  return v_row;
end;
$function$;

grant execute on function public.erp_workflow_state_upsert(uuid, text, text, text, text, boolean, boolean, integer, text, boolean)
  to anon, authenticated, service_role;

-- ใบงานออกแบบ: 2 ขั้นที่มีเฉพาะงานลูกค้า
update public.erp_workflow_states set customer_only = true
where entity_type = 'design_sheet' and state_key in ('quoted', 'sent_customer');

notify pgrst, 'reload schema';
