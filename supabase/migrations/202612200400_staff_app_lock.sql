-- แอปพนักงาน รอบ 2 — ล็อกพนักงานให้อยู่ในแอป (lib/app-lock.ts · docs/staff-apps.md)
-- เจ้าของอนุมัติ 2026-11-19
-- หลักการ: คนที่แอดมินติ๊ก "ล็อกไว้ในแอปนี้" (แล้วกดเผยแพร่) ใช้ได้แค่สิทธิ์ของเมนูในแอปนั้น
--   สิทธิ์ที่ใช้ได้ = สิทธิ์ของคนนั้นเอง ∩ allowed_perms ของทุกแอปที่ล็อกเขา · แอดมินไม่ถูกล็อก
--   ไม่มีใครถูกล็อก = ฟังก์ชันสิทธิ์ทำงานเหมือนเดิมทุกอย่าง (ตรวจแล้ว: ผลของผู้ใช้ 13 คนก่อน/หลังเท่ากัน)

alter table public.erp_app_groups
  add column if not exists lock jsonb,
  add column if not exists allowed_perms text[],
  add column if not exists allowed_hrefs jsonb;

comment on column public.erp_app_groups.lock is 'แอปพนักงาน: ใครถูกล็อกให้อยู่ในแอปนี้ { roles?: [], users?: [] } (ค่าที่เผยแพร่แล้ว) · null = ไม่ล็อกใคร';
comment on column public.erp_app_groups.allowed_perms is 'แอปพนักงาน: สิทธิ์ที่คนถูกล็อกใช้ได้ (คำนวณตอนเผยแพร่ — lib/app-lock computeAllowedPerms)';
comment on column public.erp_app_groups.allowed_hrefs is 'แอปพนักงาน: หน้าที่คนถูกล็อกเปิดได้ [{href, ro?}] (ro = ดูอย่างเดียว)';

-- สิทธิ์ที่คนนี้ใช้ได้ตามล็อก — null = ไม่ถูกล็อก
create or replace function public.erp_app_lock_perms(p_uid uuid, p_role text)
returns text[]
language sql stable security definer
set search_path to 'public'
as $$
  with l as (
    select coalesce(g.allowed_perms, array[]::text[]) ap
    from public.erp_app_groups g
    where g.kind = 'staff' and g.status = 'published' and g.deleted_at is null and g.lock is not null
      and p_role is distinct from 'admin'
      and (coalesce((g.lock -> 'roles') ? p_role, false) or coalesce((g.lock -> 'users') ? p_uid::text, false))
  )
  select case when not exists (select 1 from l) then null
    else coalesce((select array_agg(distinct p) from l, unnest(l.ap) p), array[]::text[]) end;
$$;
revoke all on function public.erp_app_lock_perms(uuid, text) from public, anon, authenticated;

create or replace function public.erp_can(p_permission text)
returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare v_role text; v_mode text; v_found boolean; v_lock text[];
begin
  select role into v_role from public.user_profiles where id = auth.uid() and active = true;
  if v_role is null then return false; end if;
  if v_role = 'admin' then return true; end if;            -- admin override (กันล็อกออก)
  v_lock := public.erp_app_lock_perms(auth.uid(), v_role);  -- 🔒 ล็อกในแอปพนักงาน ชนะทุกข้อ
  if v_lock is not null and not (p_permission = any(v_lock)) then return false; end if;
  select mode into v_mode from public.erp_user_permissions
    where user_id = auth.uid() and permission_key = p_permission;
  if v_mode = 'revoke' then return false; end if;          -- ปิดเฉพาะคน ชนะ role
  if v_mode = 'grant'  then return true;  end if;          -- เปิดเฉพาะคน ชนะ role
  select exists (
    select 1 from public.erp_role_permissions rp
    join public.erp_roles r on r.key = rp.role_key
    where rp.role_key = v_role and rp.permission_key = p_permission and r.active = true
  ) into v_found;
  return v_found;
end;
$function$;

create or replace function public.erp_can_user(p_user uuid, p_permission text)
returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare v_role text; v_mode text; v_found boolean; v_lock text[];
begin
  select role into v_role from public.user_profiles where id = p_user and active = true;
  if v_role is null then return false; end if;
  if v_role = 'admin' then return true; end if;
  v_lock := public.erp_app_lock_perms(p_user, v_role);
  if v_lock is not null and not (p_permission = any(v_lock)) then return false; end if;
  select mode into v_mode from public.erp_user_permissions
    where user_id = p_user and permission_key = p_permission;
  if v_mode = 'revoke' then return false; end if;
  if v_mode = 'grant'  then return true;  end if;
  select exists (
    select 1 from public.erp_role_permissions rp
    join public.erp_roles r on r.key = rp.role_key
    where rp.role_key = v_role and rp.permission_key = p_permission and r.active = true
  ) into v_found;
  return v_found;
end;
$function$;

create or replace function public.erp_my_permissions()
returns text[]
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare v_role text; v_perms text[]; v_lock text[];
begin
  select role into v_role from public.user_profiles where id = auth.uid() and active = true;
  if v_role is null then return array[]::text[]; end if;
  if v_role = 'admin' then
    select coalesce(array_agg(key), array[]::text[]) into v_perms from public.erp_permissions;
    return v_perms;
  end if;
  v_lock := public.erp_app_lock_perms(auth.uid(), v_role);
  select coalesce(array_agg(k), array[]::text[]) into v_perms
  from (
    select rp.permission_key as k
    from public.erp_role_permissions rp join public.erp_roles r on r.key = rp.role_key
    where rp.role_key = v_role and r.active = true
    union
    select permission_key from public.erp_user_permissions where user_id = auth.uid() and mode = 'grant'
  ) base
  where k not in (
    select permission_key from public.erp_user_permissions where user_id = auth.uid() and mode = 'revoke'
  )
  and (v_lock is null or k = any(v_lock));
  return v_perms;
end;
$function$;
