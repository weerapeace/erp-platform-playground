-- =====================================================================
-- 🔒 ปิดเขียนตรง erp_lookups / erp_lookup_types (audit 2026-11-17 · ต่อจาก 202611171300)
-- รันหลังโค้ด /api/lookups (+[id], types) ย้ายไปเขียนผ่านเซิร์ฟเวอร์ขึ้นเว็บแล้วเท่านั้น
-- authenticated ยังอ่านได้ (policy *_select เดิม) · สำรอง security_backup.policies_20261117_lookups
-- ย้อนกลับ: supabase/security/20261117_lock_open_write_ROLLBACK.sql
-- =====================================================================
create table if not exists security_backup.policies_20261117_lookups as
  select now() as backed_up_at, p.* from pg_policies p
  where p.schemaname = 'public' and p.tablename in ('erp_lookups', 'erp_lookup_types');

drop policy if exists erp_lookup_types_write on public.erp_lookup_types;
drop policy if exists erp_lookups_insert on public.erp_lookups;
drop policy if exists erp_lookups_update on public.erp_lookups;
drop policy if exists erp_lookups_delete on public.erp_lookups;
