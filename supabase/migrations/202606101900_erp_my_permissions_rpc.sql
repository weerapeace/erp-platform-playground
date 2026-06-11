-- เฟส 1 ระบบสิทธิ์: คืน "รายการสิทธิ์ทั้งหมดของผู้ใช้ปัจจุบัน" ให้หน้าเว็บโหลดไปใช้
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (erp_my_permissions_rpc) 2026-06-11
-- admin = ได้ทุกสิทธิ์ใน catalog · คนอื่น = ตามตำแหน่ง (role) ที่ active · ไม่ล็อกอิน/inactive = []
-- อ่านอย่างเดียว ไม่แก้ข้อมูล — สอดคล้องกับ erp_can() (admin override + role_permissions matrix)
-- หน้าเว็บ (components/auth) โหลดผลนี้ตอน login แล้ว can() เช็คจาก array นี้แทนค่า hardcode
create or replace function public.erp_my_permissions()
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_role  text;
  v_perms text[];
begin
  select role into v_role from public.user_profiles where id = auth.uid() and active = true;
  if v_role is null then
    return array[]::text[];
  end if;
  if v_role = 'admin' then
    select coalesce(array_agg(key), array[]::text[]) into v_perms from public.erp_permissions;
    return v_perms;
  end if;
  select coalesce(array_agg(rp.permission_key), array[]::text[]) into v_perms
  from public.erp_role_permissions rp
  join public.erp_roles r on r.key = rp.role_key
  where rp.role_key = v_role and r.active = true;
  return v_perms;
end;
$function$;
