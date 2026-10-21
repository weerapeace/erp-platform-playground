-- =====================================================================
-- S6 (ตาราง) · ปิดตาราง 6 ตัวที่ไม่มีกุญแจ (RLS ปิด) + view รายชื่อพนักงาน
-- Audit 2026-10-21 · Supabase advisor: rls_disabled_in_public = 6, security_definer_view = 1
--
-- ทำอะไร:
--   - เปิด RLS (ไม่ตั้ง policy) = anon/authenticated เข้าตรงไม่ได้ · service_role ยังใช้ได้ปกติ
--   - ถอนสิทธิ์ตารางจาก anon/authenticated
--   - view employee_options: ถอนสิทธิ์คนนอก (พนักงานที่ล็อกอินยังอ่านได้เหมือนเดิม)
--   - ไม่ลบตารางสำรอง (ลบได้ทีหลังถ้าเจ้าของยืนยันว่าไม่ใช้)
--
-- หลักฐานว่าไม่พัง:
--   - erp_doc_stamps (ตราประทับ) ใช้ที่ app/api/admin/doc-stamps/route.ts ผ่าน supabaseAdmin เท่านั้น
--     (supabaseFromRequest ในไฟล์นั้นใช้แค่ auth.getUser) · หน้าพิมพ์ PO ดึงผ่าน API นี้
--   - ตารางสำรอง 5 ตัว: ไม่มีโค้ดใช้ · log 24 ชม. ไม่มีการเรียก
--   - employee_options: ไม่มีโค้ดใช้ · log 24 ชม. ไม่มีการเรียก
-- =====================================================================

create schema if not exists security_backup;

create table if not exists security_backup.open_tables_acl_20261029 as
select c.relname::text as table_name, c.relrowsecurity as rls_was_enabled,
       g.grantee::text as grantee, g.privilege_type::text as privilege_type, now() as backed_up_at
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join information_schema.role_table_grants g
  on g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon', 'authenticated')
where c.relname in ('erp_doc_stamps', 'erp_report_templates_backup', 'erp_report_templates_qr_backup_20260731',
                    'erp_report_templates_bk_po_20260803', 'erp_report_templates_bk_so_20260803',
                    'partners_v2_taxfix_bk_20260803', 'employee_options');

revoke all on security_backup.open_tables_acl_20261029 from public, anon, authenticated;

alter table public.erp_doc_stamps                          enable row level security;
alter table public.erp_report_templates_backup             enable row level security;
alter table public.erp_report_templates_qr_backup_20260731 enable row level security;
alter table public.erp_report_templates_bk_po_20260803     enable row level security;
alter table public.erp_report_templates_bk_so_20260803     enable row level security;
alter table public.partners_v2_taxfix_bk_20260803          enable row level security;

revoke all on public.erp_doc_stamps,
              public.erp_report_templates_backup,
              public.erp_report_templates_qr_backup_20260731,
              public.erp_report_templates_bk_po_20260803,
              public.erp_report_templates_bk_so_20260803,
              public.partners_v2_taxfix_bk_20260803
  from anon, authenticated;

revoke all on public.employee_options from anon;
