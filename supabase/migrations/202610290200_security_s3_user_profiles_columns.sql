-- =====================================================================
-- S3 · ปิดทาง "พนักงานตั้งตัวเองเป็นแอดมิน / เปิดบัญชีที่ถูกปิดกลับเอง"
-- Audit 2026-10-21
--
-- ปัญหา: policy "Users can update own profile heartbeat" ให้เจ้าของแถวแก้ user_profiles ได้
--        และสิทธิ์ระดับตารางให้แก้ได้ "ทุกคอลัมน์" รวม role / active
--        → erp_can() อ่าน role จากตารางนี้ (admin = อนุญาตทุกอย่าง)
--
-- ทำอะไร: พนักงานแก้ตารางนี้ตรง ๆ ได้แค่ last_seen_at ของแถวตัวเอง (ตามชื่อ policy เดิม)
--         ทางเปลี่ยน role/active ที่ถูกต้อง (erp_admin_users_update_role / set_active) มีด่าน
--         erp_can('admin.users') และรันในนามเจ้าของ → ยังใช้ได้ปกติ
--
-- หลักฐานว่าไม่พัง: โค้ดทุกจุดที่แก้ user_profiles ใช้ supabaseAdmin (service_role)
--   (me/language, me/theme, admin/users, link-employee, line-link, payroll-employees-db)
--   log 24 ชม.: PATCH user_profiles 700 ครั้ง มาจากกุญแจ service ทั้งหมด · สิทธิ์พนักงานมีแค่ GET 1 ครั้ง
-- =====================================================================

create schema if not exists security_backup;

create table if not exists security_backup.user_profiles_acl_20261029 as
select grantee::text as grantee, privilege_type::text as privilege_type, null::text as column_name, now() as backed_up_at
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'user_profiles' and grantee in ('anon', 'authenticated')
union all
select grantee::text, privilege_type::text, column_name::text, now()
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'user_profiles' and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE');

revoke all on security_backup.user_profiles_acl_20261029 from public, anon, authenticated;

-- ถอนสิทธิ์เขียนระดับตาราง (anon ถูก RLS กันอยู่แล้ว แต่ถอนด้วยให้สะอาด)
revoke insert, update, delete, truncate on public.user_profiles from anon, authenticated;

-- เหลือแค่ "เวลาออนไลน์ล่าสุด" ให้พนักงานอัปเดตแถวตัวเอง (policy เดิมคุมว่าแถวต้องเป็นของตัวเอง)
grant update (last_seen_at) on public.user_profiles to authenticated;
