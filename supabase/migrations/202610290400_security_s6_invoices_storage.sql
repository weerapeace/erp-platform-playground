-- =====================================================================
-- S6 (ที่เก็บไฟล์) · ปิดที่เก็บใบแจ้งหนี้ค่าบริการ "invoices" (57 ไฟล์)
-- Audit 2026-10-21
--
-- ปัญหา: bucket invoices ตั้งเป็น public (ใครมี URL ก็โหลดได้) และมี policy "anon_invoices"
--        ให้คนนอก (anon) ทำได้ทุกอย่างกับไฟล์ในนั้น: ดูรายการ ดาวน์โหลด เขียนทับ ลบ
--
-- ทำอะไร: ตั้ง bucket เป็นส่วนตัว + ลบ policy anon_invoices
--
-- หลักฐานว่าไม่พัง: โค้ดทุกจุดที่ใช้ bucket นี้ (app/api/subscriptions/**) ใช้ supabaseAdmin
--   และเปิดไฟล์ด้วย createSignedUrl(s) (ลิงก์ชั่วคราว) อยู่แล้ว · ไม่มี getPublicUrl
--
-- ⚠️ storage.objects เป็นของ supabase_storage_admin ไม่ใช่ postgres → การลบ policy อาจไม่ได้รับอนุญาต
--    ถ้าไม่ได้ ไฟล์นี้จะแจ้งเตือน (ไม่ล้ม) แล้วเจ้าของลบเองใน Dashboard:
--    Storage → Policies → bucket "invoices" → policy "anon_invoices" → Delete
-- =====================================================================

create schema if not exists security_backup;

create table if not exists security_backup.storage_invoices_20261029 as
select b.id as bucket_id, b.public as was_public,
       p.policyname::text as policyname, p.cmd::text as cmd, p.roles::text as roles, p.qual, p.with_check, now() as backed_up_at
from storage.buckets b
left join pg_policies p on p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'anon_invoices'
where b.id = 'invoices';

revoke all on security_backup.storage_invoices_20261029 from public, anon, authenticated;

update storage.buckets set public = false where id = 'invoices' and public;

do $$
begin
  begin
    drop policy if exists "anon_invoices" on storage.objects;
    raise notice 'ลบ policy anon_invoices แล้ว';
  exception when insufficient_privilege then
    raise warning 'ลบ policy anon_invoices ไม่ได้ (ไม่ใช่เจ้าของ storage.objects) — ให้เจ้าของลบใน Dashboard → Storage → Policies';
  end;
end $$;
