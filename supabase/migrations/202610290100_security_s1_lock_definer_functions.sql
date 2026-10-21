-- =====================================================================
-- S1 · ล็อก "ฟังก์ชันสิทธิ์สูง" (SECURITY DEFINER) ไม่ให้คนนอกเรียกตรงได้
-- Audit 2026-10-21 · https://claude.ai/artifact/2Ty8u1afdtVQfYdEcLZuSg
--
-- ปัญหา: กุญแจสาธารณะ (anon/publishable — อยู่ในหน้า Login) เรียกฟังก์ชันสิทธิ์สูงได้ 266 ตัว
--        ~106 ตัวไม่เช็กผู้เรียก เช่น erp_admin_drop_column, loan_payment_record, ctm_employee_list (คืน PIN)
--
-- ทำอะไร:
--   1) สำรองสิทธิ์เดิมทั้งหมดไว้ที่ security_backup.function_acl_20261029 (ใช้ย้อนกลับ)
--   2) ทุกฟังก์ชัน SECURITY DEFINER ใน public/ctm (ยกเว้น trigger):
--        - service_role (เซิร์ฟเวอร์) เรียกได้เสมอ
--        - "คนนอก" (anon + PUBLIC) เรียกไม่ได้ ยกเว้น 13 ตัวในรายการ anon_keep
--        - "พนักงานที่ล็อกอิน" (authenticated) คงสิทธิ์เดิม ยกเว้น 68 ตัวในรายการ auth_revoke
--   3) ไม่แตะข้อมูลธุรกิจ · ไม่แตะฟังก์ชัน trigger (REST เรียกไม่ได้อยู่แล้ว และ trigger ทำงานต่อปกติ)
--
-- หลักฐานว่าไม่พัง (ตรวจ 2026-10-21):
--   - โค้ด ERP: 68 ตัวใน auth_revoke ถูกเรียกผ่าน supabaseAdmin (service_role) เท่านั้น
--     (ยกเว้น erp_material_families_import_batch ที่หน้า "นำเข้า" เรียกด้วยสิทธิ์พนักงาน → ไม่อยู่ในรายการ)
--   - ฟังก์ชันที่เรียกต่อกันข้างใน (เช่น trigger เงินกู้ → erp_next_number) เป็น SECURITY DEFINER ทั้งหมด
--     = รันในนามเจ้าของ (postgres) ไม่ต้องใช้สิทธิ์ของผู้เรียก
--   - log API วันที่ 7, 14, 20–21 ต.ค.: คนนอกเรียกแค่ฟังก์ชันใน anon_keep · ไม่มีใครเรียก 68 ตัวด้วยสิทธิ์พนักงาน
--   - ไม่มีคอลัมน์ default / check constraint / view ไหนเรียกฟังก์ชันเหล่านี้
--   - เจ้าของฟังก์ชันทั้ง 281 ตัว = postgres
-- =====================================================================

-- 1) ที่เก็บสำรอง (ไม่เปิดให้ API เห็น)
create schema if not exists security_backup;
revoke all on schema security_backup from public, anon, authenticated;
comment on schema security_backup is 'สำรองสิทธิ์ก่อนแก้ความปลอดภัย (audit 2026-10-21) — ใช้ย้อนกลับ ห้ามเปิดให้ API';

create table if not exists security_backup.function_acl_20261029 as
select p.oid::regprocedure::text as signature,
       n.nspname                  as schema_name,
       p.proname                  as function_name,
       case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type,
       now()                      as backed_up_at
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.prosecdef and p.prokind = 'f' and n.nspname in ('public', 'ctm');

revoke all on security_backup.function_acl_20261029 from public, anon, authenticated;

-- 2) ปรับสิทธิ์
do $$
declare
  r record;
  -- คนนอกยังเรียกได้ (13 ตัว)
  anon_keep text[] := array[
    -- ปลอดภัย: ไม่ได้ล็อกอิน = คืน false/ค่าว่าง · กฎ RLS ใช้ · หน้า Login/กระดิ่งใช้
    'erp_can', 'has_payroll_role', 'erp_current_user', 'erp_current_role', 'erp_my_permissions',
    'erp_notifications_list', 'erp_notifications_unread_count',
    -- ชั่วคราว: API เก่า 6 เส้นเรียกด้วยกุญแจคนนอก (audit-logs, dashboard, playground-products,
    -- products, purchase-requests x2) — แก้โค้ดให้ใช้ supabaseAdmin + guardApi ก่อน แล้วค่อยถอนในไฟล์ถัดไป
    'erp_playground_get_audit_logs', 'erp_playground_dashboard_stats', 'erp_playground_get_products',
    'erp_playground_products_list', 'erp_playground_pr_list', 'erp_playground_pr_get'
  ];
  -- พนักงานที่ล็อกอินก็เรียกตรงไม่ได้ (68 ตัว) — โค้ดเรียกผ่านเซิร์ฟเวอร์เท่านั้น
  auth_revoke text[] := array[
    -- แอปเก่า Creative Task Manager (ไม่มีโค้ด/ไม่มีการใช้งาน)
    'ctm_employee_get', 'ctm_employee_list', 'ctm_employee_login_list', 'ctm_employee_patch',
    'ctm_employee_to_json', 'ctm_employee_upsert', 'ctm_employee_verify_pin', 'ctm_outbox_mark',
    'ctm_outbox_pending', 'ctm_parent_sku_get', 'ctm_parent_sku_search', 'ctm_product_sku_get',
    'ctm_product_sku_search', 'ctm_r2_image_backfill_candidates', 'ctm_r2_image_backfill_update',
    'ctm_task_find_by_child', 'ctm_task_get', 'ctm_task_list', 'ctm_task_list_compact',
    'ctm_task_patch', 'ctm_task_permanent_delete', 'ctm_task_upsert',
    -- แก้โครงสร้างตาราง
    'erp_admin_add_column', 'erp_admin_add_fk', 'erp_admin_create_m2m', 'erp_admin_create_table',
    'erp_admin_drop_column', 'erp_distinct_values',
    -- สต๊อก / ผลิต / QC
    'erp_fg_manual_in', 'erp_fg_to_scrap', 'erp_mo_issue_materials', 'erp_mo_issue_to_wip',
    'erp_qc_receive_scrap', 'erp_qc_receive_to_fg', 'erp_qc_repair_receive', 'erp_qc_reverse_item',
    'erp_qc_ship', 'erp_stock_apply_movement', 'erp_stock_count_apply', 'erp_stock_count_open',
    'erp_stock_count_scan', 'erp_stock_post_internal', 'sku_stock_receive',
    -- เอกสารซื้อขาย / เลขเอกสาร / แจ้งเตือน
    'erp_next_number', 'erp_notify', 'erp_po_compute_totals', 'erp_po_receive_stock_in',
    'erp_quote_compute_totals', 'erp_so_compute_totals', 'erp_so_release_reservation',
    'erp_so_reserve_stock', 'erp_so_ship_stock_out',
    -- เงินกู้ / OD
    'loan_contract_auto_drawdown', 'loan_contract_lump_sum_sync', 'loan_contract_reallocate',
    'loan_contract_recompute', 'loan_dashboard', 'loan_payment_record', 'loan_restructure_apply',
    'loan_restructure_revert', 'loan_schedule_apply_manual', 'loan_schedule_base',
    'loan_schedule_chain_recompute', 'loan_schedule_generate', 'loan_schedule_set_rows',
    'loan_schedule_version_recompute', 'od_recompute', 'od_recon_build'
  ];
  n_anon int := 0;
  n_auth int := 0;
begin
  if array_length(auth_revoke, 1) <> 68 or array_length(anon_keep, 1) <> 13 then
    raise exception 'รายการไม่ครบตามที่ตรวจไว้ (auth_revoke=%, anon_keep=%)',
      array_length(auth_revoke, 1), array_length(anon_keep, 1);
  end if;

  for r in
    select p.oid::regprocedure as fn, p.proname,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_had
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and p.prokind = 'f' and n.nspname in ('public', 'ctm')
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('grant execute on function %s to service_role', r.fn);

    if r.proname = any(anon_keep) then
      continue;
    end if;

    -- คงสิทธิ์พนักงานเดิมแบบระบุชื่อ (เพราะจะถอนจาก PUBLIC ที่บางตัวพึ่งอยู่)
    if r.auth_had and not (r.proname = any(auth_revoke)) then
      execute format('grant execute on function %s to authenticated', r.fn);
    end if;

    execute format('revoke execute on function %s from public, anon', r.fn);
    n_anon := n_anon + 1;

    if r.proname = any(auth_revoke) then
      execute format('revoke execute on function %s from authenticated', r.fn);
      n_auth := n_auth + 1;
    end if;
  end loop;

  raise notice 'ถอนสิทธิ์คนนอก % ฟังก์ชัน · ถอนสิทธิ์พนักงานทั่วไป % ฟังก์ชัน', n_anon, n_auth;
end $$;
