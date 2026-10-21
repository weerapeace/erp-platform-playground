-- ตรวจหลังรัน (อ่านอย่างเดียว) — ทุกแถวควรได้ค่าตาม "ควรเป็น"
select 'S1 คนนอกเรียกฟังก์ชันสิทธิ์สูงได้ (ไม่นับ trigger)' as check_name,
       count(*)::text as actual, '13 (เฉพาะรายการ anon_keep)' as expected
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and p.prokind = 'f' and n.nspname in ('public','ctm') and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'EXECUTE')
union all
select 'S1 พนักงานยังเรียก 68 ตัวอันตรายได้', count(*)::text, '0'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.proname in ('erp_admin_drop_column','erp_admin_create_table','loan_payment_record','erp_stock_apply_movement',
                    'ctm_employee_list','ctm_task_permanent_delete','erp_next_number','od_recompute')
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
union all
select 'S1 เซิร์ฟเวอร์เรียกไม่ได้ (ต้องเป็น 0)', count(*)::text, '0'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and p.prokind = 'f' and n.nspname in ('public','ctm')
  and not has_function_privilege('service_role', p.oid, 'EXECUTE')
union all
select 'S1 พนักงานเสียสิทธิ์ที่ไม่ควรเสีย (เทียบสำรอง)', count(*)::text, '0'
from security_backup.function_acl_20261029 b
join pg_proc p on p.oid = b.signature::regprocedure
where b.grantee in ('authenticated','PUBLIC') and b.privilege_type = 'EXECUTE'
  and p.proname <> all (array['ctm_employee_get','ctm_employee_list','ctm_employee_login_list','ctm_employee_patch','ctm_employee_to_json','ctm_employee_upsert','ctm_employee_verify_pin','ctm_outbox_mark','ctm_outbox_pending','ctm_parent_sku_get','ctm_parent_sku_search','ctm_product_sku_get','ctm_product_sku_search','ctm_r2_image_backfill_candidates','ctm_r2_image_backfill_update','ctm_task_find_by_child','ctm_task_get','ctm_task_list','ctm_task_list_compact','ctm_task_patch','ctm_task_permanent_delete','ctm_task_upsert','erp_admin_add_column','erp_admin_add_fk','erp_admin_create_m2m','erp_admin_create_table','erp_admin_drop_column','erp_distinct_values','erp_fg_manual_in','erp_fg_to_scrap','erp_mo_issue_materials','erp_mo_issue_to_wip','erp_qc_receive_scrap','erp_qc_receive_to_fg','erp_qc_repair_receive','erp_qc_reverse_item','erp_qc_ship','erp_stock_apply_movement','erp_stock_count_apply','erp_stock_count_open','erp_stock_count_scan','erp_stock_post_internal','sku_stock_receive','erp_next_number','erp_notify','erp_po_compute_totals','erp_po_receive_stock_in','erp_quote_compute_totals','erp_so_compute_totals','erp_so_release_reservation','erp_so_reserve_stock','erp_so_ship_stock_out','loan_contract_auto_drawdown','loan_contract_lump_sum_sync','loan_contract_reallocate','loan_contract_recompute','loan_dashboard','loan_payment_record','loan_restructure_apply','loan_restructure_revert','loan_schedule_apply_manual','loan_schedule_base','loan_schedule_chain_recompute','loan_schedule_generate','loan_schedule_set_rows','loan_schedule_version_recompute','od_recompute','od_recon_build'])
  and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
union all
select 'S3 พนักงานแก้ role ตัวเองได้', has_column_privilege('authenticated','public.user_profiles','role','UPDATE')::text, 'false'
union all
select 'S3 พนักงานแก้ active ตัวเองได้', has_column_privilege('authenticated','public.user_profiles','active','UPDATE')::text, 'false'
union all
select 'S3 พนักงานอัปเดตเวลาออนไลน์ได้', has_column_privilege('authenticated','public.user_profiles','last_seen_at','UPDATE')::text, 'true'
union all
select 'S6 ตารางไม่มี RLS ใน public', count(*)::text, '0'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'S6 คนนอกลบตราประทับได้', has_table_privilege('anon','public.erp_doc_stamps','DELETE')::text, 'false'
union all
select 'S6 คนนอกอ่านรายชื่อพนักงานได้', has_table_privilege('anon','public.employee_options','SELECT')::text, 'false'
union all
select 'S6 bucket invoices เป็นสาธารณะ', (select public::text from storage.buckets where id = 'invoices'), 'false'
union all
select 'S6 policy anon_invoices ยังอยู่', (select count(*)::text from pg_policies where schemaname='storage' and policyname='anon_invoices'), '0 (ถ้า 1 = เจ้าของลบใน Dashboard)';
