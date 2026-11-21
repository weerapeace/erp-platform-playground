-- พนักงานลาออก/ปิดใช้งาน → ปิดบัญชีล็อกอิน ERP ที่ผูกอยู่ด้วย ทุกทางที่เปลี่ยนสถานะ (ความปลอดภัย · เจ้าของสั่ง 2026-11-21)
--   เดิมปิดบัญชีเฉพาะตอนแก้ที่ฟอร์มพนักงาน (syncUserAccountOnEmploymentChange) — สัญญาหมดแล้วระบบเปลี่ยนเป็นลาออก
--   (lib/payroll-contract-lifecycle) และปิดช่างจากบอร์ด (/api/mo/assignees) ไม่ได้ปิดบัญชี → ยังล็อกอินได้
--   ปิดบัญชี = user_profiles.active false (erp_can คืน false ทุกสิทธิ์) · ไม่ลบ · ลง audit deactivate_user_on_resign
--   กลับมาทำงาน = ไม่เปิดบัญชีคืนเอง (ตั้งใจ · เหมือนเดิม) → แอดมินเปิดเอง
--   ต่อจาก 202612220200 (ปลดผูกไลน์) — ฟังก์ชันเดียวกัน

create or replace function public.employees_left_unlink_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.employment_status = 'active' and new.employment_status is distinct from old.employment_status then
    -- 1) ปลดผูกไลน์ (เก็บแถว)
    with u as (
      update public.line_memberships
         set status = 'unlinked', unlinked_at = now(), updated_at = now()
       where employee_id = new.id and status in ('linked', 'blocked')
      returning id, line_user_id
    )
    insert into public.audit_logs (action, entity_type, entity_id, metadata)
    select 'unlink_line_on_resign', 'line_memberships', u.id,
           jsonb_build_object('actor', 'ระบบ (พนักงานลาออก/ปิดใช้งาน)', 'employee_id', new.id,
                              'line_user_id', u.line_user_id, 'employment_status', new.employment_status)
      from u;
    new.line_user_id := null;
    new.line_display_name := null;
    new.line_picture_url := null;
    new.line_linked_at := null;

    -- 2) ปิดบัญชีล็อกอิน ERP ที่ผูกกับพนักงานคนนี้
    with p as (
      update public.user_profiles
         set active = false, updated_at = now()
       where employee_id = new.id and active = true
      returning id
    )
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    select null, 'deactivate_user_on_resign', 'user', p.id,
           jsonb_build_object('actor', 'ระบบ (พนักงานลาออก/ปิดใช้งาน)', 'employee_id', new.id,
                              'employment_status', new.employment_status, 'changes',
                              jsonb_build_array(jsonb_build_object('field', 'active', 'old', true, 'new', false)))
      from p;
  end if;
  return new;
end $$;

revoke all on function public.employees_left_unlink_line() from public, anon, authenticated;
