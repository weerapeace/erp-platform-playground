-- 💬 ส่งรายงานเข้า Discord + ปุ่มติ๊กเช็กลิสต์ในแชท (เจ้าของขอ 2026-10-23 "ทำครบทุกขั้นถึงปุ่มติ๊ก")
-- 1) erp_discord_links   = ผูกบัญชี Discord ↔ ผู้ใช้ ERP (กดติ๊กใน Discord แล้วระบบรู้ว่าใคร + เช็กสิทธิ์)
-- 2) email_reports.discord = ตั้งค่าส่ง Discord ของรายงานแต่ละตัว (ห้อง · แท็กบทบาท · จำนวนในรูป/การ์ด)
-- 3) erp_can_user(user, perm) = ตรวจสิทธิ์แบบระบุผู้ใช้ (ปุ่มใน Discord ไม่มี token ล็อกอิน ERP)
--    ตรรกะเดียวกับ erp_can(perm) ทุกบรรทัด (แก้ที่หนึ่ง ต้องแก้อีกที่) · เรียกได้เฉพาะ service_role
-- DDL ชุดเดียว = PostgREST รีโหลดครั้งเดียว (~10 วิ)

create table if not exists public.erp_discord_links (
  user_id          uuid primary key references public.user_profiles(id) on delete cascade,
  discord_user_id  text not null unique,
  discord_username text,
  linked_at        timestamptz not null default now()
);
alter table public.erp_discord_links enable row level security;   -- ไม่มี policy = ผ่าน API (service role) เท่านั้น
revoke all on public.erp_discord_links from anon, authenticated;
comment on table public.erp_discord_links is 'ผูกบัญชี Discord กับผู้ใช้ ERP (หน้า /account/discord · ใช้ตอนกดปุ่มติ๊กใน Discord)';

alter table public.email_reports add column if not exists discord jsonb not null default '{}'::jsonb;
comment on column public.email_reports.discord is 'ส่ง Discord: { enabled, channel_id, channel_name, role_id, role_name, mention, image_rows, max_cards } (normalizeReportDiscord)';

create or replace function public.erp_can_user(p_user uuid, p_permission text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_role text; v_mode text; v_found boolean;
begin
  select role into v_role from public.user_profiles where id = p_user and active = true;
  if v_role is null then return false; end if;
  if v_role = 'admin' then return true; end if;
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
revoke all on function public.erp_can_user(uuid, text) from public, anon, authenticated;
grant execute on function public.erp_can_user(uuid, text) to service_role;
