-- 📧 ส่งอีเมลรายงานตามเวลา — โทเคนให้ pg_cron เรียก /api/cron/email-reports (เก็บเข้ารหัสใน Supabase Vault)
-- ไม่ต้องตั้งค่าเพิ่มใน Vercel: pg_cron อ่านโทเคนจาก vault ใส่ header x-cron-token · route ตรวจผ่าน erp_cron_token_ok (service_role เท่านั้น)

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_reports_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'email_reports_cron', 'โทเคนให้ pg_cron เรียก /api/cron/email-reports');
  end if;
end $$;

create or replace function public.erp_cron_token_ok(p_name text, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets s
    where s.name = p_name and p_token is not null and length(p_token) >= 32 and s.decrypted_secret = p_token
  );
$$;

-- audit 2026-10-21: ฟังก์ชัน DEFINER ใหม่ต้องปิด anon/authenticated
revoke all on function public.erp_cron_token_ok(text, text) from public, anon, authenticated;
grant execute on function public.erp_cron_token_ok(text, text) to service_role;

-- หน้า "ส่งอีเมลรายงาน" ใช้บอกว่าตัวตั้งเวลาทำงานอยู่ไหม
create or replace function public.erp_email_reports_cron_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from cron.job where jobname = 'email-reports-every-15min' and active);
$$;
revoke all on function public.erp_email_reports_cron_active() from public, anon, authenticated;
grant execute on function public.erp_email_reports_cron_active() to service_role;

-- งาน pg_cron (ทุก 15 นาที) ตั้งหลัง deploy route แล้ว:
-- select cron.schedule('email-reports-every-15min', '*/15 * * * *', $job$
--   select net.http_post(
--     url := 'https://erp-platform-playground.vercel.app/api/cron/email-reports',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'email_reports_cron')),
--     body := '{}'::jsonb, timeout_milliseconds := 60000)
-- $job$);
