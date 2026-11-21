-- พนักงานลาออก/ปิดใช้งาน → ปลดผูกไลน์อัตโนมัติ (ความปลอดภัย · เจ้าของสั่ง 2026-11-21)
--   ทำที่ฐานข้อมูล เพราะเปลี่ยนสถานะได้หลายทาง (ฟอร์มพนักงาน · สัญญาหมด · ปิดช่างจากบอร์ดจ่ายงาน · แก้ตรง)
--   ปลดผูก = เก็บแถวไว้ (status unlinked + unlinked_at) ไม่ลบ · ลงประวัติ audit_logs ทุกแถว
--   กลับมาทำงาน = ไม่ผูกคืนเอง (ตั้งใจ) → HR พิมพ์บัตร QR ใบใหม่ (บัตรเก่าใช้ไม่ได้เพราะ unlinked_at ใหม่กว่า)
--   เมนูล่างจอไลน์บริษัท: โค้ดสลับให้หลังเปลี่ยนสถานะ (lib/line-company-server · syncCompanyMenuForEmployees)

create or replace function public.employees_left_unlink_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.employment_status = 'active' and new.employment_status is distinct from old.employment_status then
    with u as (
      update public.line_memberships
         set status = 'unlinked', unlinked_at = now(), updated_at = now()
       where employee_id = new.id and status in ('linked', 'blocked')
      returning id, line_user_id, status
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
  end if;
  return new;
end $$;

revoke all on function public.employees_left_unlink_line() from public, anon, authenticated;

drop trigger if exists employees_left_unlink_line on public.employees;
create trigger employees_left_unlink_line
  before update of employment_status on public.employees
  for each row execute function public.employees_left_unlink_line();

-- เก็บกวาดคนที่ลาออกไปแล้วแต่ยังผูกไลน์ค้าง (ตรวจ 2026-11-21: 1 คน HR-001)
with u as (
  update public.line_memberships m
     set status = 'unlinked', unlinked_at = now(), updated_at = now()
    from public.employees e
   where e.id = m.employee_id and m.status in ('linked', 'blocked') and e.employment_status is distinct from 'active'
  returning m.id, m.line_user_id, m.employee_id, e.employment_status
)
insert into public.audit_logs (action, entity_type, entity_id, metadata)
select 'unlink_line_on_resign', 'line_memberships', u.id,
       jsonb_build_object('actor', 'ระบบ (เก็บกวาดคนที่ลาออกแล้ว)', 'employee_id', u.employee_id,
                          'line_user_id', u.line_user_id, 'employment_status', u.employment_status)
  from u;

update public.employees
   set line_user_id = null, line_display_name = null, line_picture_url = null, line_linked_at = null
 where employment_status is distinct from 'active' and line_user_id is not null;
