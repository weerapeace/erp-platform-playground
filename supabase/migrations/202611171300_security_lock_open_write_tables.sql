-- =====================================================================
-- 🔒 ปิด "พนักงานที่ล็อกอินแล้วเขียนตารางตรงได้" 80 ตาราง (audit 2026-11-17 · เจ้าของอนุมัติในแชต)
-- เดิม policy FOR ALL TO authenticated USING (true) = ใครล็อกอินก็ insert/update/delete ผ่าน REST ได้ ข้ามด่านสิทธิ์ของหน้าจอ
-- หลังแก้: authenticated อ่านได้เหมือนเดิม (policy <ตาราง>_read) · เขียนผ่านเซิร์ฟเวอร์ (service role ข้าม RLS) เท่านั้น
-- หลักฐานว่าไม่มีใครเขียนตรง: สแกนโค้ด ERP (0 จุด) + log ฐานข้อมูล 3 วัน (0 คำขอเขียนด้วยสิทธิ์พนักงาน) + trigger/ฟังก์ชัน invoker
-- สำรอง: security_backup.policies_20261117 · ย้อนกลับ: supabase/security/20261117_lock_open_write_ROLLBACK.sql
-- (erp_lookups / erp_lookup_types แยกไปไฟล์ถัดไป หลังย้ายโค้ด /api/lookups ไปใช้เซิร์ฟเวอร์)
-- =====================================================================
create table if not exists security_backup.policies_20261117 as
  select now() as backed_up_at, p.* from pg_policies p
  where p.schemaname = 'public' and p.tablename in ('app_settings','banks','belt_hole','belt_logo','belt_loops','belt_size_cal','belt_tails','belt_template','belt_width_size','bom_headers','bom_labor_rates','bom_lines','bom_piecework_lines','bom_work_steps','card_layouts','china_transfer_counters','ctm_api_cache','customer_products','cutting_jobs','defect_logs','deliveries','employees_department_m2m_m2m','erp_campaign_categories','erp_creative_caption_templates','erp_creative_knowledge','erp_creative_task_parent_skus','erp_creative_task_platforms','erp_creative_task_skus','erp_creative_trends','erp_logic_registry','erp_platforms','erp_playground_billing_note_lines','erp_playground_billing_notes','erp_playground_credit_note_lines','erp_playground_credit_notes','erp_playground_quotations','erp_playground_quote_lines','erp_task_types','goods_receipts','manufacturing_orders','marketplace_sku_mappings','material_families','material_requirements','material_slots','mo_delivery_plan','mo_dispatch_plan_lines','mo_dispatch_plans','mo_groups','mo_piecework','mo_plan_ot','parent_skus_v2_product_family_m2m','pattern_versions','piecework_jobs','piecework_rate_history','pr_lines','product_family_groups','product_groups','product_piece_lists','product_variations','production_jobs','promotions','promotions_tags_m2m','purchase_requests_v2','qc_inspections','quotations','rework_jobs','routings','sales_orders','size_templates','skus_v2_product_family_m2m','stock_adjustments','stock_count_sessions','stock_locations','stock_lots','stock_lpns','supplier_items','supplier_price_history','task_templates','uom_conversions','work_centers');

do $$
declare
  t text; pol record;
  tables text[] := array['app_settings','banks','belt_hole','belt_logo','belt_loops','belt_size_cal','belt_tails','belt_template','belt_width_size','bom_headers','bom_labor_rates','bom_lines','bom_piecework_lines','bom_work_steps','card_layouts','china_transfer_counters','ctm_api_cache','customer_products','cutting_jobs','defect_logs','deliveries','employees_department_m2m_m2m','erp_campaign_categories','erp_creative_caption_templates','erp_creative_knowledge','erp_creative_task_parent_skus','erp_creative_task_platforms','erp_creative_task_skus','erp_creative_trends','erp_logic_registry','erp_platforms','erp_playground_billing_note_lines','erp_playground_billing_notes','erp_playground_credit_note_lines','erp_playground_credit_notes','erp_playground_quotations','erp_playground_quote_lines','erp_task_types','goods_receipts','manufacturing_orders','marketplace_sku_mappings','material_families','material_requirements','material_slots','mo_delivery_plan','mo_dispatch_plan_lines','mo_dispatch_plans','mo_groups','mo_piecework','mo_plan_ot','parent_skus_v2_product_family_m2m','pattern_versions','piecework_jobs','piecework_rate_history','pr_lines','product_family_groups','product_groups','product_piece_lists','product_variations','production_jobs','promotions','promotions_tags_m2m','purchase_requests_v2','qc_inspections','quotations','rework_jobs','routings','sales_orders','size_templates','skus_v2_product_family_m2m','stock_adjustments','stock_count_sessions','stock_locations','stock_lots','stock_lpns','supplier_items','supplier_price_history','task_templates','uom_conversions','work_centers'];
begin
  foreach t in array tables loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
        and cmd in ('ALL','INSERT','UPDATE','DELETE')
        and (roles::text like '%authenticated%' or roles::text like '%public%')
        and coalesce(qual,'true') = 'true' and coalesce(with_check,'true') = 'true'
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and cmd in ('SELECT','ALL')
                   and (roles::text like '%authenticated%' or roles::text like '%public%')) then
      execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    end if;
  end loop;
end $$;
