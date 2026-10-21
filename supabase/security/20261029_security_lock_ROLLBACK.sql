-- =====================================================================
-- ย้อนกลับ migration ความปลอดภัย 2026-10-29 (0100–0400) — ใช้เมื่อมีหน้าไหนพังหลังรัน
-- รันทีละส่วนได้ (เลือกเฉพาะส่วนที่ต้องการย้อน) · คืนสิทธิ์จากตาราง security_backup.*
-- =====================================================================

-- ---------- ย้อน S1 (ฟังก์ชัน) ----------
do $$
declare r record;
begin
  -- ล้างสิทธิ์ปัจจุบันของ 3 กลุ่ม แล้วให้คืนตามที่สำรองไว้
  for r in select distinct signature from security_backup.function_acl_20261029 loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated', r.signature);
    exception when undefined_function then
      raise notice 'ข้าม (ฟังก์ชันไม่มีแล้ว): %', r.signature;
    end;
  end loop;
  for r in
    select signature, grantee from security_backup.function_acl_20261029
    where privilege_type = 'EXECUTE' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  loop
    begin
      execute format('grant execute on function %s to %s', r.signature,
                     case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- ---------- ย้อน S3 (user_profiles) ----------
revoke update (last_seen_at) on public.user_profiles from authenticated;
grant insert, update, delete, truncate on public.user_profiles to anon, authenticated;  -- ค่าเดิมของ Supabase

-- ---------- ย้อน S6 ตาราง ----------
alter table public.erp_doc_stamps                          disable row level security;
alter table public.erp_report_templates_backup             disable row level security;
alter table public.erp_report_templates_qr_backup_20260731 disable row level security;
alter table public.erp_report_templates_bk_po_20260803     disable row level security;
alter table public.erp_report_templates_bk_so_20260803     disable row level security;
alter table public.partners_v2_taxfix_bk_20260803          disable row level security;
grant all on public.erp_doc_stamps, public.erp_report_templates_backup,
             public.erp_report_templates_qr_backup_20260731, public.erp_report_templates_bk_po_20260803,
             public.erp_report_templates_bk_so_20260803, public.partners_v2_taxfix_bk_20260803
  to anon, authenticated;
grant select on public.employee_options to anon;

-- ---------- ย้อน S6 ที่เก็บไฟล์ ----------
update storage.buckets set public = true where id = 'invoices';
-- policy anon_invoices: ถ้าจำเป็นจริง สร้างคืนใน Dashboard (ไม่แนะนำ — เปิดให้คนนอกลบไฟล์ได้)
--   create policy "anon_invoices" on storage.objects for all to anon
--     using (bucket_id = 'invoices') with check (bucket_id = 'invoices');
