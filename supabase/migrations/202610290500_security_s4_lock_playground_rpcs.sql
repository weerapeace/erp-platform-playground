-- =====================================================================
-- S4 · ปิด 6 ฟังก์ชัน erp_playground_* ที่ S1 เปิดไว้ชั่วคราว
-- Audit 2026-10-21
--
-- ก่อนหน้า: API เก่า 6 เส้น (audit-logs, dashboard, playground-products, products,
--           purchase-requests, purchase-requests/[id]) เรียกฟังก์ชันพวกนี้ด้วยกุญแจคนนอก
--           → ใครก็อ่านประวัติแก้ไข 69,172 แถว / สินค้า / ใบขอซื้อ ได้
-- แก้โค้ดแล้ว (commit 902cd5dc): ทุกเส้นใช้ supabaseAdmin (service_role) + guardApi
--
-- ทำอะไร: ให้เรียกได้จากเซิร์ฟเวอร์ (service_role) อย่างเดียว
--         ถอนจาก PUBLIC / anon / authenticated (ไม่มีโค้ดไหนเรียกด้วยสิทธิ์พนักงาน)
-- ย้อนกลับ: supabase/security/20261029_security_lock_ROLLBACK.sql (ส่วน S1 คืนสิทธิ์ตามสำรองเดิม)
-- =====================================================================

create schema if not exists security_backup;

create table if not exists security_backup.function_acl_s4_20261029 as
select p.oid::regprocedure::text as signature,
       case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type, now() as backed_up_at
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where n.nspname = 'public'
  and p.proname in ('erp_playground_get_audit_logs', 'erp_playground_dashboard_stats', 'erp_playground_get_products',
                    'erp_playground_products_list', 'erp_playground_pr_list', 'erp_playground_pr_get');

revoke all on security_backup.function_acl_s4_20261029 from public, anon, authenticated;

do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('erp_playground_get_audit_logs', 'erp_playground_dashboard_stats', 'erp_playground_get_products',
                        'erp_playground_products_list', 'erp_playground_pr_list', 'erp_playground_pr_get')
  loop
    execute format('grant execute on function %s to service_role', r.fn);
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    n := n + 1;
  end loop;
  if n <> 6 then
    raise exception 'คาดว่าจะเจอ 6 ฟังก์ชัน แต่เจอ %', n;
  end if;
end $$;
